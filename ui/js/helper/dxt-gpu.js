// The GPU half of the HAP encoder of the media helper (Convert to HAP, path A): DXT1 / scaled YCoCg (HAP Q) / DXT5 (HAP Alpha)
// compression of a picture on the GPU, one fragment per 4x4 block. Ported from VEATION (Immersive Studio Pro - app.js >
// DXT_FS, dxtEncodeCanvas), same owner; the differences: it works on an OffscreenCanvas of its own (not the editor's canvas),
// reads a texture uploaded with row 0 = the TOP of the picture (so no vertical flip in the fetch), and adds HAP Alpha. It asks
// for the LOW-POWER GPU (the room's PC also runs Unreal on the big one) and does one frame at a time.
// The block stream it returns is what hapFrame() (/shared/hapenc.js) wraps. Row 0 of a HAP texture is the TOP of the image.

const VS = `#version 300 es
precision highp float; in vec2 a_p; void main(){ gl_Position=vec4(a_p,0.0,1.0); }`;

const DXT_FS = `precision highp float; precision highp int;
uniform sampler2D u_src; uniform ivec2 u_dim;
out uvec4 o_blk;
uint pk565(vec3 c){ uvec3 q=uvec3(floor(clamp(c,0.0,1.0)*vec3(31.0,63.0,31.0)+0.5)); return (q.r<<11)|(q.g<<5)|q.b; }
vec3 up565(uint v){ uint r=(v>>11)&31u,g=(v>>5)&63u,b=v&31u; return vec3(float((r<<3)|(r>>2)),float((g<<2)|(g>>4)),float((b<<3)|(b>>2)))/255.0; }
void colorBlock(vec3 c[16], out uint w0, out uint w1){
  vec3 mu=vec3(0.0), mn=vec3(1.0), mx=vec3(0.0);
  for(int k=0;k<16;k++){ mu+=c[k]; mn=min(mn,c[k]); mx=max(mx,c[k]); }
  mu*=0.0625;
  /* Endpoints must lie on the block's PRINCIPAL AXIS, not on the per-channel bounding box. A block of red
     and cyan has a box spanning black→white, so a box-based encoder emits a grey ramp and every pixel
     quantises to grey (measured: 27 dB vs ffmpeg's 42 on the same frame). Covariance + power iteration
     recovers the real colour axis — the same thing stb_dxt does. */
  float cxx=0.0,cxy=0.0,cxz=0.0,cyy=0.0,cyz=0.0,czz=0.0;
  for(int k=0;k<16;k++){ vec3 d=c[k]-mu; cxx+=d.x*d.x; cxy+=d.x*d.y; cxz+=d.x*d.z; cyy+=d.y*d.y; cyz+=d.y*d.z; czz+=d.z*d.z; }
  vec3 v=mx-mn; if(dot(v,v)<1e-9) v=vec3(0.299,0.587,0.114); /* seed with the box diagonal; luma axis when the block is flat */
  for(int i=0;i<8;i++){
    vec3 nv=vec3(cxx*v.x+cxy*v.y+cxz*v.z, cxy*v.x+cyy*v.y+cyz*v.z, cxz*v.x+cyz*v.y+czz*v.z);
    float mg=max(max(abs(nv.x),abs(nv.y)),abs(nv.z));
    if(mg<1e-9) break; /* covariance collapsed (solid block) → keep the seed */
    v=nv/mg; }
  if(dot(v,v)<1e-9) v=vec3(0.299,0.587,0.114);
  float dmin=1e9,dmax=-1e9; vec3 pmn=c[0],pmx=c[0];
  for(int k=0;k<16;k++){ float d=dot(c[k],v); if(d<dmin){dmin=d;pmn=c[k];} if(d>dmax){dmax=d;pmx=c[k];} }
  uint c0=pk565(pmx), c1=pk565(pmn);
  if(c0<c1){ uint t=c0; c0=c1; c1=t; } /* BC1 needs c0>c1 for 4-colour mode; the 565 packing is not monotonic in RGB so compare PACKED */
  uint idx=0u;
  if(c0!=c1){ /* c0==c1 → solid block, all indices 0 (and 3-colour mode would give the same colour anyway) */
    vec3 p0=up565(c0), p1=up565(c1);
    vec3 pal[4]; pal[0]=p0; pal[1]=p1; pal[2]=(2.0*p0+p1)/3.0; pal[3]=(p0+2.0*p1)/3.0;
    for(int k=0;k<16;k++){ float bd=1e9; uint bi=0u;
      for(int q=0;q<4;q++){ vec3 d=c[k]-pal[q]; float dd=dot(d,d); if(dd<bd){ bd=dd; bi=uint(q); } }
      idx|=bi<<uint(2*k); } }
  w0=c0|(c1<<16); w1=idx;
}
void alphaBlock(float a[16], out uint w0, out uint w1){
  float amn=1.0,amx=0.0; for(int k=0;k<16;k++){ amn=min(amn,a[k]); amx=max(amx,a[k]); }
  uint a0=uint(floor(amx*255.0+0.5)), a1=uint(floor(amn*255.0+0.5));
  uint lo=0u, hi=0u; /* 48 bits of 3-bit indices, LSB-first */
  if(a0!=a1){ float f0=float(a0), f1=float(a1);
    for(int k=0;k<16;k++){ float av=a[k]*255.0; float bd=1e9; uint bi=0u;
      for(int q=0;q<8;q++){ float pv = (q==0)? f0 : ((q==1)? f1 : ((float(8-q)*f0+float(q-1)*f1)/7.0));
        float d=abs(av-pv); if(d<bd){ bd=d; bi=uint(q); } }
      uint bp=uint(3*k);
      if(bp<32u){ lo|=bi<<bp; if(bp>29u) hi|=bi>>(32u-bp); } else hi|=bi<<(bp-32u); } }
  w0=a0|(a1<<8)|((lo&0xFFFFu)<<16); w1=(lo>>16)|(hi<<16);
}
void main(){
  ivec2 b=ivec2(gl_FragCoord.xy);
  vec4 t[16];
  for(int j=0;j<4;j++) for(int i=0;i<4;i++){
    ivec2 p=clamp(ivec2(b.x*4+i, b.y*4+j), ivec2(0), u_dim-ivec2(1));
    t[j*4+i]=texelFetch(u_src,p,0); }
#if VAR==1
  vec3 c[16]; for(int k=0;k<16;k++) c[k]=t[k].rgb;
  uint w0,w1; colorBlock(c,w0,w1); o_blk=uvec4(w0,w1,0u,0u);
#elif VAR==5
  vec3 c5[16]; float a5[16]; for(int k=0;k<16;k++){ c5[k]=t[k].rgb; a5[k]=t[k].a; }
  uint aw0_,aw1_,cw0_,cw1_; alphaBlock(a5,aw0_,aw1_); colorBlock(c5,cw0_,cw1_); o_blk=uvec4(aw0_,aw1_,cw0_,cw1_);
#else
  /* Scaled YCoCg (HapY): Y goes in the BC3 alpha block (8-bit endpoints + 3-bit lerp = a good luma), and
     (Co,Cg,scale) in the colour block. Chroma is scaled up per block to use the full 565 range and the
     factor is stashed in blue as (scale-1)*8 — the three legal values (0/8/24) survive 5-bit quantisation
     EXACTLY, which is the whole reason the format encodes it that way. Decoder: scale = blue*255/8 + 1. */
  vec3 ch[16]; float y[16]; float m=0.0;
  for(int k=0;k<16;k++){ vec3 s=t[k].rgb;
    float Y=(s.r+2.0*s.g+s.b)*0.25, Co=(s.r-s.b)*0.5, Cg=(-s.r+2.0*s.g-s.b)*0.25;
    ch[k]=vec3(Co,Cg,0.0); y[k]=Y; m=max(m,max(abs(Co),abs(Cg))); }
  float mb=m*255.0, sc=1.0; if(mb<63.0) sc=2.0; if(mb<31.0) sc=4.0;
  float bl=(sc-1.0)*8.0/255.0;
  vec3 c[16];
  for(int k=0;k<16;k++) c[k]=vec3(clamp(ch[k].x*sc+0.50196078,0.0,1.0), clamp(ch[k].y*sc+0.50196078,0.0,1.0), bl);
  uint aw0,aw1,cw0,cw1; alphaBlock(y,aw0,aw1); colorBlock(c,cw0,cw1);
  o_blk=uvec4(aw0,aw1,cw0,cw1);
#endif
}`;

const VARIANT = { dxt1: 1, ycocg: 7, dxt5: 5 };

/** @returns {{encode:(src:CanvasImageSource|VideoFrame|ImageBitmap, w:number, h:number) => Uint8Array, close:() => void, info:{renderer:string}}} */
export function createDxtEncoder(tex) {
  const cv = new OffscreenCanvas(4, 4);
  const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) throw Object.assign(new Error('this computer has no WebGL 2 for the HAP encoder'), { code: 'no-webgl' });
  const kind = VARIANT[tex];
  if (!kind) throw new Error(`no DXT variant for ${tex}`);
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `#version 300 es\n#define VAR ${kind}\n${DXT_FS}`));
  gl.bindAttribLocation(prog, 0, 'a_p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const uSrc = gl.getUniformLocation(prog, 'u_src'), uDim = gl.getUniformLocation(prog, 'u_dim');
  let srcTex = null, fbo = null, outTex = null, buf = null, sw = 0, sh = 0, bw = 0, bh = 0;

  const ensure = (W, H) => {
    if (!srcTex || sw !== W || sh !== H) {
      if (srcTex) gl.deleteTexture(srcTex);
      srcTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      sw = W; sh = H;
    }
    const nbw = Math.ceil(W / 4), nbh = Math.ceil(H / 4);
    if (!outTex || bw !== nbw || bh !== nbh) {
      if (outTex) { gl.deleteTexture(outTex); gl.deleteFramebuffer(fbo); }
      outTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, outTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, nbw, nbh, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
      const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`the DXT target is incomplete (0x${st.toString(16)})`);
      bw = nbw; bh = nbh; buf = new Uint32Array(bw * bh * 4);
      cv.width = bw; cv.height = bh;
    }
  };

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    info: { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' },
    /** The block stream of a picture of W x H: 8 bytes a block (DXT1) or 16 (YCoCg, DXT5), row-major, top row first. */
    encode(src, W, H) {
      ensure(W, H);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, bw, bh);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.uniform1i(uSrc, 0); gl.uniform2i(uDim, W, H);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.readPixels(0, 0, bw, bh, gl.RGBA_INTEGER, gl.UNSIGNED_INT, buf);
      if (tex === 'dxt1') { // BC1 is 8 bytes a block: keep .rg
        const out = new Uint8Array(bw * bh * 8), o32 = new Uint32Array(out.buffer);
        for (let i = 0, n = bw * bh; i < n; i++) { o32[2 * i] = buf[4 * i]; o32[2 * i + 1] = buf[4 * i + 1]; }
        return out;
      }
      return new Uint8Array(buf.buffer.slice(0, bw * bh * 16));
    },
    close() { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* gone */ } },
  };
}
