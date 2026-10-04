"""glbpose.py — GLB(스킨 · 애니메이션)를 읽어 원하는 자세로 정점을 굽는 작은 도구 (numpy 만 씀)."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class GLB:
    def __init__(self, path):
        f = open(path, 'rb').read()
        jl = struct.unpack('<I', f[12:16])[0]
        self.J = json.loads(f[20:20 + jl])
        off = 20 + jl
        bl = struct.unpack('<I', f[off:off + 4])[0]
        self.bin = f[off + 8: off + 8 + bl]
        self.names = [n.get('name', '') for n in self.J['nodes']]
        self.parent = [-1] * len(self.J['nodes'])
        for i, n in enumerate(self.J['nodes']):
            for c in n.get('children', []):
                self.parent[c] = i

    def acc(self, i):
        a = self.J['accessors'][i]
        bv = self.J['bufferViews'][a['bufferView']]
        dt, nc = CT[a['componentType']], NC[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0)
        isz = np.dtype(dt).itemsize * nc
        if stride and stride != isz:
            raw = np.frombuffer(self.bin, np.uint8, a['count'] * stride, start).reshape(a['count'], stride)[:, :isz]
            arr = np.frombuffer(raw.tobytes(), dt).reshape(a['count'], nc)
        else:
            arr = np.frombuffer(self.bin, dt, a['count'] * nc, start).reshape(a['count'], nc)
        if a.get('normalized'):
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr

    def image(self, i):
        im = self.J['images'][i]; bv = self.J['bufferViews'][im['bufferView']]
        s = bv.get('byteOffset', 0)
        return self.bin[s:s + bv['byteLength']], im.get('mimeType')

    # ── 자세 ──
    def local_trs(self, anim=None, t=0.0):
        T = {}
        for i, n in enumerate(self.J['nodes']):
            T[i] = [np.array(n.get('translation', [0, 0, 0]), float), np.array(n.get('rotation', [0, 0, 0, 1]), float), np.array(n.get('scale', [1, 1, 1]), float)]
        if anim is not None:
            A = next(a for a in self.J['animations'] if a['name'] == anim)
            for ch in A['channels']:
                s = A['samplers'][ch['sampler']]
                tin = self.acc(s['input'])[:, 0]; out = self.acc(s['output'])
                path = ch['target']['path']; node = ch['target']['node']
                if path == 'weights': continue
                tt = min(max(t, tin[0]), tin[-1])
                k = np.searchsorted(tin, tt, side='right') - 1; k = min(max(k, 0), len(tin) - 1)
                if k == len(tin) - 1 or s.get('interpolation') == 'STEP':
                    v = out[k].astype(float)
                else:
                    u = (tt - tin[k]) / (tin[k + 1] - tin[k])
                    a, b = out[k].astype(float), out[k + 1].astype(float)
                    if path == 'rotation':
                        if np.dot(a, b) < 0: b = -b
                        d = np.clip(np.dot(a, b), -1, 1); th = np.arccos(d)
                        v = a * (1 - u) + b * u if th < 1e-5 else (np.sin((1 - u) * th) * a + np.sin(u * th) * b) / np.sin(th)
                        v /= np.linalg.norm(v)
                    else:
                        v = a * (1 - u) + b * u
                T[node][['translation', 'rotation', 'scale'].index(path)] = v
        return T

    @staticmethod
    def mat(t, q, s):
        x, y, z, w = q
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4); M[:3, :3] = R * s; M[:3, 3] = t
        return M

    def globals(self, anim=None, t=0.0):
        T = self.local_trs(anim, t)
        G = [None] * len(T)
        def g(i):
            if G[i] is None:
                L = self.mat(*T[i])
                G[i] = L if self.parent[i] < 0 else g(self.parent[i]) @ L
            return G[i]
        for i in range(len(T)): g(i)
        return G

    def skin_mats(self, G, skin=0):
        S = self.J['skins'][skin]
        ibm = self.acc(S['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)   # 열 우선 → 행렬
        return np.array([G[j] @ ibm[k] for k, j in enumerate(S['joints'])])

    def node_pos(self, G, name):
        return G[self.names.index(name)][:3, 3].copy()


def skin_prim(glb, prim, JM):
    a = prim['attributes']
    P = glb.acc(a['POSITION']).astype(float); N = glb.acc(a['NORMAL']).astype(float)
    J = glb.acc(a['JOINTS_0']).astype(int); W = glb.acc(a['WEIGHTS_0']).astype(float)
    W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
    M = np.einsum('vk,vkij->vij', W, JM[J])                      # 정점마다 섞인 행렬
    P2 = np.einsum('vij,vj->vi', M[:, :3, :3], P) + M[:, :3, 3]
    N2 = np.einsum('vij,vj->vi', M[:, :3, :3], N)
    N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
    return P2, N2
