// HAP encoding, the pure half (no Node, no DOM): Snappy, HAP frames and the QuickTime writer's atoms. Ported from VEATION
// (Immersive Studio Pro · app.js › HAP_FMT, snappyCompress, hapSection, hapFrame, movBuild, movFtyp), same owner. It is
// served to the helper page as /shared/hapenc.js (the page DXT-encodes a frame on the GPU and wraps it with hapFrame) and
// imported by the engine (convert.js writes the .mov with movBuild). Spec: github.com/Vidvox/hap · HapVideoDRAFT.md —
// section type values are NOT sequential: 0xAB/0xBB/0xCB = DXT1, 0xAE/0xBE/0xCE = DXT5, 0xAF/0xBF/0xCF = scaled YCoCg.
/* eslint-disable */
'use strict';
export const HAP_FMT={
  hap : {fourcc:'Hap1', tex:'dxt1',  depth:24, bpb:8,  none:0xAB, snappy:0xBB, chunked:0xCB, label:'Hap1', bpp:0.5}, // RGB · DXT1/BC1
  hapq: {fourcc:'HapY', tex:'ycocg', depth:24, bpb:16, none:0xAF, snappy:0xBF, chunked:0xCF, label:'HapY', bpp:1  }, // scaled YCoCg · DXT5/BC3
};
export function u8cat(list){ let n=0; for(const a of list)n+=a.length; const o=new Uint8Array(n); let p=0; for(const a of list){ o.set(a,p); p+=a.length; } return o; }
HAP_FMT.hapa={fourcc:'Hap5', tex:'dxt5', depth:32, bpb:16, none:0xAE, snappy:0xBE, chunked:0xCE, label:'Hap5', bpp:1}; // RGBA · DXT5/BC3 (HAP Alpha)
export function snappyCompress(src){
  const n=src.length, out=new Uint8Array(32+n+Math.ceil(n/6)); let op=0,v=n;
  while(v>=128){ out[op++]=(v&127)|128; v=Math.floor(v/128); } out[op++]=v;
  for(let bs=0;bs<n;bs+=65536) op=_snapFrag(src,bs,Math.min(65536,n-bs),out,op);
  return out.subarray(0,op);
}
function _snapFrag(src,base,len,out,op){
  const end=base+len;
  const emitLit=(s,l)=>{ if(l<=0)return; const m=l-1;
    if(m<60) out[op++]=m<<2;
    else { let nb=0,x=m; while(x>0){ nb++; x>>>=8; } out[op++]=(59+nb)<<2; x=m; for(let i=0;i<nb;i++){ out[op++]=x&255; x>>>=8; } }
    out.set(src.subarray(s,s+l),op); op+=l; };
  const emitCopy=(off,l)=>{
    while(l>=68){ out[op++]=(63<<2)|2; out[op++]=off&255; out[op++]=(off>>>8)&255; l-=64; }
    if(l>64){ out[op++]=(59<<2)|2; out[op++]=off&255; out[op++]=(off>>>8)&255; l-=60; }
    if(l>=4&&l<=11&&off<2048){ out[op++]=1|((l-4)<<2)|(((off>>>8)&7)<<5); out[op++]=off&255; }
    else { out[op++]=2|((l-1)<<2); out[op++]=off&255; out[op++]=(off>>>8)&255; } };
  if(len<15){ emitLit(base,len); return op; }
  let tsz=256,shift=24; while(tsz<len&&tsz<16384){ tsz<<=1; shift--; }
  const tab=new Int32Array(tsz).fill(base), mask=tsz-1;
  const ld=i=>(src[i]|(src[i+1]<<8)|(src[i+2]<<16)|(src[i+3]<<24))>>>0;
  const hs=x=>(Math.imul(x,0x1e35a7bd)>>>shift)&mask;
  const limit=end-15;
  let ip=base+1, anchor=base, nextHash=hs(ld(ip)), done=false;
  while(!done){
    let skip=32, nextIp=ip, cand=base;
    for(;;){ ip=nextIp; const h=nextHash; nextIp=ip+(skip>>>5); skip++;
      if(nextIp>limit){ done=true; break; }
      nextHash=hs(ld(nextIp)); cand=tab[h]; tab[h]=ip;
      if(cand<ip && ld(ip)===ld(cand)) break; } // cand<ip: a zero offset would be an invalid copy tag
    if(done)break;
    emitLit(anchor,ip-anchor);
    for(;;){ const bip=ip; let m=4;
      while(ip+m<end && src[cand+m]===src[ip+m]) m++;
      ip+=m; emitCopy(bip-cand,m); anchor=ip;
      if(ip>limit){ done=true; break; }
      tab[hs(ld(ip-1))]=ip-1;
      const h=hs(ld(ip)); cand=tab[h]; tab[h]=ip;
      if(cand>=ip || ld(ip)!==ld(cand)) break; }
    if(done)break;
    nextHash=hs(ld(ip+1)); ip++;
  }
  emitLit(anchor,end-anchor);
  return op;
}

/* ---- HAP frame: section header is 4 bytes (24-bit size + type), or 8 when the size needs more. ---- */
export function hapSection(type,payload){ const n=payload.length;
  if(n<0x1000000){ const h=new Uint8Array(4); h[0]=n&255; h[1]=(n>>>8)&255; h[2]=(n>>>16)&255; h[3]=type; return [h,payload]; }
  const h=new Uint8Array(8); h[3]=type; h[4]=n&255; h[5]=(n>>>8)&255; h[6]=(n>>>16)&255; h[7]=(n>>>24)&255; return [h,payload]; }
/* Chunks exist so the DECODER can spread a frame over several threads: each chunk is compressed
   independently, so N chunks = N cores able to inflate at once. Cost is a little ratio (each chunk
   restarts the Snappy window) — worth it for 4K, pointless for small frames. */
export function hapFrame(tex,fmt,chunks){
  const F=HAP_FMT[fmt], bpb=F.bpb;
  const nb=Math.floor(tex.length/bpb); // split on BLOCK boundaries so every chunk is whole blocks
  const want=Math.max(1,Math.min(64,chunks|0));
  const per=Math.max(1,Math.ceil(nb/want)), real=Math.ceil(nb/per);
  const comp=[];
  for(let i=0;i<real;i++){ const raw=tex.subarray(i*per*bpb, Math.min(tex.length,(i+1)*per*bpb));
    const c=snappyCompress(raw);
    comp.push(c.length<raw.length?{d:c,t:0x0B}:{d:raw,t:0x0A}); } // incompressible → store it raw, like the reference encoder
  if(real===1) return u8cat(hapSection(comp[0].t===0x0B?F.snappy:F.none, comp[0].d));
  const ct=new Uint8Array(real); for(let i=0;i<real;i++) ct[i]=comp[i].t;              // 0x02 compressor table
  const szb=new Uint8Array(real*4), dv=new DataView(szb.buffer);                       // 0x03 size table (COMPRESSED sizes)
  for(let i=0;i<real;i++) dv.setUint32(i*4,comp[i].d.length,true);
  const di=u8cat([].concat(hapSection(0x02,ct),hapSection(0x03,szb)));
  const inner=u8cat([].concat(hapSection(0x01,di), comp.map(c=>c.d)));                 // instructions, then the chunk data
  return u8cat(hapSection(F.chunked,inner));
}

/* ---- QuickTime .mov writer (big-endian atoms). Video: one sample per chunk. Audio: 16-bit PCM 'sowt',
   interleaved a frame at a time. co64 + a 64-bit mdat throughout — HAP at 4K runs GBs per minute and
   32-bit offsets would silently wrap. ---- */
function _fcc(s){ const u=new Uint8Array(4); for(let i=0;i<4;i++)u[i]=s.charCodeAt(i); return u; }
export function _atom(type,parts){ let n=8; for(const p of parts)n+=p.length; const h=new Uint8Array(8); new DataView(h.buffer).setUint32(0,n>>>0); h.set(_fcc(type),4); return u8cat([h].concat(parts)); }
function _bytes(n,fill){ const b=new Uint8Array(n); const dv=new DataView(b.buffer); if(fill)fill(dv,b); return b; }
const _MATRIX=(()=>{ const b=new Uint8Array(36), dv=new DataView(b.buffer); dv.setUint32(0,0x00010000); dv.setUint32(16,0x00010000); dv.setUint32(32,0x40000000); return b; })();
function _hdlr(ctype,subtype,name){ const nm=new TextEncoder().encode(name);
  return _atom('hdlr',[_bytes(25+nm.length,(dv,b)=>{ b.set(_fcc(ctype),4); b.set(_fcc(subtype),8); b[24]=nm.length; b.set(nm,25); })]); }
function _dinf(){ return _atom('dinf',[_atom('dref',[_bytes(8,(dv)=>{dv.setUint32(4,1);}), _bytes(12,(dv,b)=>{ dv.setUint32(0,12); b.set(_fcc('url '),4); dv.setUint32(8,1); })])]); }
function _stts(entries){ return _atom('stts',[_bytes(8+entries.length*8,(dv)=>{ dv.setUint32(4,entries.length); entries.forEach((e,i)=>{ dv.setUint32(8+i*8,e[0]); dv.setUint32(12+i*8,e[1]); }); })]); }
function _stsc(entries){ return _atom('stsc',[_bytes(8+entries.length*12,(dv)=>{ dv.setUint32(4,entries.length); entries.forEach((e,i)=>{ dv.setUint32(8+i*12,e[0]); dv.setUint32(12+i*12,e[1]); dv.setUint32(16+i*12,e[2]); }); })]); }
function _stszTab(sizes){ return _atom('stsz',[_bytes(12+sizes.length*4,(dv)=>{ dv.setUint32(8,sizes.length); sizes.forEach((s,i)=>dv.setUint32(12+i*4,s)); })]); }
function _stszFix(sz,count){ return _atom('stsz',[_bytes(12,(dv)=>{ dv.setUint32(4,sz); dv.setUint32(8,count); })]); }
function _co64(offs){ return _atom('co64',[_bytes(8+offs.length*8,(dv)=>{ dv.setUint32(4,offs.length); offs.forEach((o,i)=>{ dv.setUint32(8+i*8,Math.floor(o/4294967296)); dv.setUint32(12+i*8,o>>>0); }); })]); }
function _mvhd(ts,dur,nextId){ return _atom('mvhd',[u8cat([_bytes(20,(dv)=>{ dv.setUint32(12,ts); dv.setUint32(16,dur); }), _bytes(4,(dv)=>dv.setUint32(0,0x00010000)), _bytes(2,(dv)=>dv.setUint16(0,0x0100)), new Uint8Array(10), _MATRIX, new Uint8Array(24), _bytes(4,(dv)=>dv.setUint32(0,nextId))])]); }
function _tkhd(id,dur,w,h,vol){ return _atom('tkhd',[u8cat([
  _bytes(24,(dv)=>{ dv.setUint32(0,0x00000003); dv.setUint32(12,id); dv.setUint32(20,dur); }), // flags 3 = enabled + in movie
  new Uint8Array(8), _bytes(8,(dv)=>{ dv.setUint16(4,vol); }), _MATRIX,
  _bytes(8,(dv)=>{ dv.setUint32(0,w*65536); dv.setUint32(4,h*65536); })])]); }
function _mdhd(ts,dur){ return _atom('mdhd',[_bytes(24,(dv)=>{ dv.setUint32(12,ts); dv.setUint32(16,dur); dv.setUint16(20,0x55C4); })]); } // 0x55C4 = 'und'
function _stsdVideo(fourcc,w,h,depth){ const cn=new TextEncoder().encode('Hap');
  const e=_bytes(86,(dv,b)=>{ dv.setUint32(0,86); b.set(_fcc(fourcc),4); dv.setUint16(14,1); dv.setUint32(28,0x200);
    dv.setUint16(32,w); dv.setUint16(34,h); dv.setUint32(36,0x00480000); dv.setUint32(40,0x00480000); dv.setUint16(48,1);
    b[50]=cn.length; b.set(cn,51); dv.setUint16(82,depth); dv.setInt16(84,-1); });
  return _atom('stsd',[_bytes(8,(dv)=>dv.setUint32(4,1)), e]); }
function _stsdPCM(ch,sr){ const e=_bytes(36,(dv,b)=>{ dv.setUint32(0,36); b.set(_fcc('sowt'),4); dv.setUint16(14,1);
    dv.setUint16(24,ch); dv.setUint16(26,16); dv.setUint32(32,sr*65536); });
  return _atom('stsd',[_bytes(8,(dv)=>dv.setUint32(4,1)), e]); }
function _rleStsc(counts){ const out=[]; for(let i=0;i<counts.length;i++) if(!out.length||out[out.length-1][1]!==counts[i]) out.push([i+1,counts[i],1]); return out; }
export function movBuild(c){
  const TS=1000, nF=c.frames.length, durMs=Math.round(nF/c.fps*TS);
  const vts=Number.isInteger(c.fps)?c.fps:Math.round(c.fps*1000), vtick=Number.isInteger(c.fps)?1:1000; // 29.97 fps = 29970 / 1000 (a timescale is an integer)
  const vStbl=_atom('stbl',[_stsdVideo(c.fourcc,c.w,c.h,c.depth), _stts([[nF,vtick]]), _stsc([[1,1,1]]), _stszTab(c.frames.map(f=>f.size)), _co64(c.frames.map(f=>f.off))]);
  const vTrak=_atom('trak',[_tkhd(1,durMs,c.w,c.h,0), _atom('mdia',[_mdhd(vts,nF*vtick), _hdlr('mhlr','vide','VideoHandler'),
    _atom('minf',[_atom('vmhd',[_bytes(12,(dv)=>dv.setUint32(0,1))]), _hdlr('dhlr','alis','DataHandler'), _dinf(), vStbl])])]);
  const parts=[_mvhd(TS,durMs,c.audio?3:2), vTrak];
  if(c.audio){ const a=c.audio, nS=a.chunks.reduce((s,x)=>s+x.samples,0);
    const aStbl=_atom('stbl',[_stsdPCM(a.ch,a.sr), _stts([[nS,1]]), _stsc(_rleStsc(a.chunks.map(x=>x.samples))), _stszFix(a.ch*2,nS), _co64(a.chunks.map(x=>x.off))]);
    parts.push(_atom('trak',[_tkhd(2,Math.round(nS/a.sr*TS),0,0,0x0100), _atom('mdia',[_mdhd(a.sr,nS), _hdlr('mhlr','soun','SoundHandler'),
      _atom('minf',[_atom('smhd',[new Uint8Array(8)]), _hdlr('dhlr','alis','DataHandler'), _dinf(), aStbl])])])); }
  return _atom('moov',parts);
}
export function movFtyp(){ return _atom('ftyp',[u8cat([_fcc('qt  '), _bytes(4,(dv)=>dv.setUint32(0,0x20050300)), _fcc('qt  ')])]); }
