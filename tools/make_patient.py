#!/usr/bin/env python3
"""
make_patient.py — 환자(피험자 07) 3D 모델(GLB)을 깨어남 장면에 쓰도록 구워 내장합니다.

    python3 tools/make_patient.py <hospital_patient_game.glb>

GLB 는 175개 본의 스킨 · 애니메이션을 담고 있지만, 게임(labroom.js)은 라이브러리 없는 WebGL 이라
그 자리에서 스키닝하지 않고 필요한 자세만 미리 구워 둡니다 — 자세 사이는 GPU 가 정점끼리 섞습니다.

  자세 0 ~ 3 : Sit_Up_Preview 의 0 · ⅓ · ⅔ · 끝 (누움 → 상체를 일으킴 → 앉음)
  자세 4     : Standing_Idle (선 자세, 일어설 때 섞어 넘어감)

머리(Head_Hide_For_FPS)는 1인칭이라 뺍니다. 담는 것 — 정점 위치(16비트) · 법선(8비트) · UV(16비트) ·
삼각형(16비트, 재질 덩어리마다) 을 gzip 으로 묶고, 피부 · 면 원단 그림은 JPEG 로 줄여 js/patient_model.js 에.
자세마다 머리(카메라) · 양손 링거 소켓 · 넓적다리 위 자리를 같이 적어 둡니다 (모델 좌표, 미터, Y 위, 앞 +Z).
"""
import base64, gzip, io, json, pathlib, sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from glbpose import GLB, skin_prim

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIT_T = [0.0, 0.611, 1.222, 1.8333]
TEX_SIZE = 1024


def main(path):
    g = GLB(path)
    poses = [('Sit_Up_Preview', t) for t in SIT_T] + [('Standing_Idle', 0.0)]
    prims = []                                          # (메시 이름, primitive, 재질)
    for m in g.J['meshes']:
        if m['name'] == 'Head_Hide_For_FPS': continue
        for pr in m['primitives']: prims.append((m['name'], pr, pr.get('material')))
    # 자세마다 굽기
    P_all, N_all, sockets = [], [], []
    for anim, t in poses:
        G = g.globals(anim, t); JM = g.skin_mats(G)
        Ps, Ns = [], []
        for _, pr, _ in prims:
            P, N = skin_prim(g, pr, JM); Ps.append(P); Ns.append(N)
        P_all.append(np.vstack(Ps)); N_all.append(np.vstack(Ns))
        lap = lambda s: ((g.node_pos(G, 'upperleg01.' + s) + g.node_pos(G, 'upperleg02.' + s)) / 2).round(4).tolist()
        sockets.append({'cam': g.node_pos(G, 'Socket_Camera').round(4).tolist(),
                        'ivL': g.node_pos(G, 'Socket_IV_L').round(4).tolist(), 'ivR': g.node_pos(G, 'Socket_IV_R').round(4).tolist(),
                        'lapL': lap('L'), 'lapR': lap('R')})
    allP = np.vstack(P_all)
    lo, hi = allP.min(0), allP.max(0)
    # 정점 · 삼각형 묶기
    out = io.BytesIO(); meta_prims = []; voff = 0
    uv_list, idx_bytes = [], []
    for name, pr, mat in prims:
        uv = g.acc(pr['attributes']['TEXCOORD_0']).astype(float)
        idx = g.acc(pr['indices'])[:, 0].astype(np.uint16)
        n = len(uv)
        meta_prims.append({'name': name, 'mat': mat, 'v0': voff, 'vn': n, 'in': int(len(idx))})
        uv_list.append(uv); idx_bytes.append(idx.tobytes()); voff += n
    UV = np.vstack(uv_list)
    uvlo, uvhi = UV.min(0), UV.max(0)
    qpos = lambda P: np.round((P - lo) / (hi - lo) * 65535).astype(np.uint16)
    qnor = lambda N: np.round(np.clip(N, -1, 1) * 127).astype(np.int8)
    quv = np.round((UV - uvlo) / (uvhi - uvlo) * 65535).astype(np.uint16)
    parts = {}
    def put(key, b):
        parts[key] = [out.tell(), len(b)]; out.write(b)
        if out.tell() % 4: out.write(b'\0' * (4 - out.tell() % 4))
    for i in range(len(poses)):
        put(f'pos{i}', qpos(P_all[i]).tobytes()); put(f'nor{i}', qnor(N_all[i]).tobytes())
    put('uv', quv.tobytes())
    for k, b in enumerate(idx_bytes): put(f'idx{k}', b)
    raw = out.getvalue(); gz = gzip.compress(raw, 9)
    # 재질 · 그림
    mats = []
    for m in g.J['materials']:
        pb = m.get('pbrMetallicRoughness', {})
        mats.append({'name': m.get('name'), 'color': pb.get('baseColorFactor', [1, 1, 1, 1])[:3],
                     'tex': pb.get('baseColorTexture', {}).get('index'), 'rough': pb.get('roughnessFactor', 1)})
    texs = {}
    for ti in {m['tex'] for m in mats if m['tex'] is not None}:
        data, _ = g.image(g.J['textures'][ti]['source'])
        im = Image.open(io.BytesIO(data)).convert('RGB')
        if im.width > TEX_SIZE: im = im.resize((TEX_SIZE, TEX_SIZE), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, 'JPEG', quality=84, optimize=True)
        texs[ti] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
    meta = {'verts': voff, 'poses': [f'{a}@{t}' for a, t in poses], 'lo': lo.round(5).tolist(), 'hi': hi.round(5).tolist(),
            'uvlo': uvlo.round(5).tolist(), 'uvhi': uvhi.round(5).tolist(), 'parts': parts, 'prims': meta_prims,
            'mats': mats, 'sockets': sockets}
    js = ('/* 이 파일은 tools/make_patient.py 가 생성합니다. 직접 고치지 마세요.\n'
          '   피험자 07 — 환자복 차림의 3D 모델 (MakeHuman CC0 바탕), 깨어남 장면용 자세 다섯을 구워 gzip 으로 묶음. */\n'
          f'const PATIENT_META = {json.dumps(meta, ensure_ascii=False)};\n'
          f"const PATIENT_TEX = {json.dumps({str(k): v for k, v in texs.items()})};\n"
          f"const PATIENT_B64 = '{base64.b64encode(gz).decode()}';\n")
    (ROOT / 'js' / 'patient_model.js').write_text(js, encoding='utf-8')
    tris = sum(p['in'] for p in meta_prims) // 3
    print(f'js/patient_model.js  {len(js) // 1024} KB  (원자료 {len(raw) // 1024} KB → gzip {len(gz) // 1024} KB)  정점 {voff}  삼각형 {tris}')
    for i, s in enumerate(sockets): print('  자세', i, poses[i], 'cam', s['cam'])


if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(sys.argv[1])
