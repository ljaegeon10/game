/* 방호복 모델(assets/hazmat_runner.glb)을 게임이 바로 읽는 꼴로 바꿉니다 → js/hazmat_model.js
   · 꼭짓점(위치 · 법선 · UV · 접선 · 뼈 번호 · 가중치) · 삼각형 · 뼈대 · 역바인드 행렬
   · 애니메이션(Idle · Walk · Run)은 30fps 로 다시 찍어 뼈마다 [이동 3 + 회전 4]
   · 텍스처 3장(색 · 법선 · ORM)은 1024 WebP 로 줄여 넣음
   쓰는 법 :  node tools/make_hazmat.js      (playwright + chromium 필요) */
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), buf = fs.readFileSync(path.join(ROOT, 'assets/hazmat_runner.glb'));
const jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString('utf8')), B0 = 28 + jl;
const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function acc(i) {
  const a = J.accessors[i], v = J.bufferViews[a.bufferView], [T, sz] = CT[a.componentType], n = NC[a.type], off = B0 + (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || sz * n;
  const out = new T(a.count * n), dv = new DataView(buf.buffer, buf.byteOffset);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const p = off + k * stride + c * sz;
    out[k * n + c] = T === Float32Array ? dv.getFloat32(p, true) : T === Uint16Array ? dv.getUint16(p, true) : T === Uint32Array ? dv.getUint32(p, true) : T === Uint8Array ? dv.getUint8(p) : dv.getInt8(p); }
  return out;
}
const prim = J.meshes[0].primitives[0], A = prim.attributes, skin = J.skins[0], joints = skin.joints;
const pos = acc(A.POSITION), nor = acc(A.NORMAL), uv = acc(A.TEXCOORD_0), tan = acc(A.TANGENT), jn = acc(A.JOINTS_0), wt = acc(A.WEIGHTS_0), idx = acc(prim.indices), ibm = acc(skin.inverseBindMatrices);
const parentOf = {}; J.nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf[c] = i));
const bones = joints.map(ni => { const n = J.nodes[ni]; return { name: n.name, parent: joints.indexOf(parentOf[ni]), t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }; });
// 애니메이션 — 30fps 로 다시 찍기
const FPS = 30, anims = {}, animData = [];
const nlerp = (a, b, k) => { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const s = d < 0 ? -1 : 1; const o = [0, 1, 2, 3].map(i => a[i] + (b[i] * s - a[i]) * k); const l = Math.hypot(...o) || 1; return o.map(x => x / l); };
for (const an of J.animations) {
  const dur = Math.max(...an.samplers.map(s => J.accessors[s.input].max[0])), frames = Math.round(dur * FPS) + 1, ch = {};
  for (const c of an.channels) { const s = an.samplers[c.sampler], b = joints.indexOf(c.target.node); if (b < 0) continue; (ch[b] = ch[b] || {})[c.target.path] = { t: acc(s.input), v: acc(s.output) }; }
  const out = new Float32Array(frames * bones.length * 7);
  for (let f = 0; f < frames; f++) for (let b = 0; b < bones.length; b++) {
    const t = f / FPS, o = (f * bones.length + b) * 7;
    const samp = (c, n, rest) => { if (!c) return rest; const T = c.t; let i = 0; while (i < T.length - 2 && T[i + 1] < t) i++;
      const k = Math.max(0, Math.min(1, (t - T[i]) / ((T[i + 1] - T[i]) || 1))), a = Array.from(c.v.slice(i * n, i * n + n)), d = Array.from(c.v.slice((i + 1) * n, (i + 1) * n + n));
      return n === 4 ? nlerp(a, d, k) : a.map((x, q) => x + (d[q] - x) * k); };
    out.set(samp(ch[b] && ch[b].translation, 3, bones[b].t), o); out.set(samp(ch[b] && ch[b].rotation, 4, bones[b].r), o + 3);
  }
  anims[an.name] = { dur, frames, off: animData.reduce((a, x) => a + x.length, 0) }; animData.push(out);
}
const jf = new Float32Array(jn.length); jf.set(jn);
const parts = { pos, nor, uv, tan, jn: jf, wt, ibm, anim: Float32Array.from(animData.flatMap(a => Array.from(a))) }, lay = {}; let off = 0; const chunks = [];
for (const k in parts) { lay[k] = [off, parts[k].length]; chunks.push(Buffer.from(parts[k].buffer, parts[k].byteOffset, parts[k].byteLength)); off += parts[k].byteLength; }
lay.idx = [off, idx.length]; chunks.push(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
const img = name => { const im = J.images.find(x => x.name === name), v = J.bufferViews[im.bufferView]; return `data:${im.mimeType};base64,` + buf.slice(B0 + (v.byteOffset || 0), B0 + (v.byteOffset || 0) + v.byteLength).toString('base64'); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const tex = {};
  for (const [k, name, q] of [['base', 'hazmat_basecolor', .86], ['normal', 'hazmat_normal', .9], ['orm', 'hazmat_orm', .84]])
    tex[k] = await p.evaluate(async ([src, q]) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 1024;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, 1024, 1024); return c.toDataURL('image/webp', q); }, [img(name), q]);
  await b.close();
  const js = `// 이 파일은 tools/make_hazmat.js 가 생성합니다 (원본 : assets/hazmat_runner.glb). 직접 고치지 마세요.
window.HAZMAT_DATA = { verts: ${pos.length / 3}, lay: ${JSON.stringify(lay)}, fps: ${FPS},
  bones: ${JSON.stringify(bones.map(b => ({ ...b, t: b.t.map(x => +x.toFixed(6)), r: b.r.map(x => +x.toFixed(6)), s: undefined })))},
  anims: ${JSON.stringify(anims)},
  bin: '${Buffer.concat(chunks).toString('base64')}',
  tex: { base: '${tex.base}', normal: '${tex.normal}', orm: '${tex.orm}' } };
`;
  fs.writeFileSync(path.join(ROOT, 'js/hazmat_model.js'), js);
  console.log('js/hazmat_model.js', (js.length / 1024 | 0) + ' KB', 'verts', pos.length / 3, 'tris', idx.length / 3, Object.keys(tex).map(k => k + ' ' + (tex[k].length / 1024 | 0) + 'KB').join(' · '), JSON.stringify(anims));
  console.log(bones.map((b, i) => i + ':' + b.name + '<' + b.parent).join(' '));
})();
