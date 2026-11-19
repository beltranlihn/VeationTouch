// The Alma Digital logo on WebGPU: the same drawing as logo.js (white "screen" light over the liquid, two cropped layers of
// the studio's artwork that keep their place in the original so they line up), same signature. The layout is logo.js's.
// It draws into the canvas's current texture, after fluid.render() in the same frame, with its own submission.

import { LAYOUT } from './logo.js';

const SHADER = `
struct U { rect: vec4f, alpha: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var t: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  // (0,0) top-left .. (1,1) bottom-right of the layer; rect = clip x0, y bottom, x1, y top
  let c = vec2f(f32(i & 1u), f32(i >> 1u));
  var o: VOut;
  o.pos = vec4f(mix(u.rect.x, u.rect.z, c.x), mix(u.rect.w, u.rect.y, c.y), 0.0, 1.0);
  o.uv = c;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  return vec4f(textureSample(t, s, v.uv).rgb * u.alpha.x, 0.0); // the textures are premultiplied
}`;

// mip levels: each one is the one above drawn at half size with linear filtering (a 2 x 2 box)
const MIPS = `
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: VOut;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  return textureSampleLevel(t, s, v.uv, 0.0);
}`;

/**
 * @param gpu     { device, context } from requestGpu (fluid-webgpu.js)
 * @param baseUrl where logo-wordmark.png and logo-blob.png live (ends with /)
 * @returns {{ ready: Promise<void>, draw, dispose }}
 */
export function createLogo(gpu, baseUrl) {
  const { device, context } = gpu;
  const queue = device.queue;
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module, entryPoint: 'fs',
      targets: [{
        format: gpu.format,
        // screen: src + dst * (1 - src); the alpha channel is left as it is
        blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src', operation: 'add' }, alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' } },
      }],
    },
    primitive: { topology: 'triangle-strip' },
  });

  const mipModule = device.createShaderModule({ code: MIPS });
  const mipPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mipModule, entryPoint: 'vs' },
    fragment: { module: mipModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
  });
  const mipSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  // one layer = a texture, its own uniforms and bind group
  const layers = { wordmark: null, blob: null };
  let disposed = false;

  const load = async (name, file) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = baseUrl + file;
    await img.decode();
    if (disposed) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    const texture = device.createTexture({ size: [w, h], format: 'rgba8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST });
    queue.copyExternalImageToTexture({ source: img }, { texture, premultipliedAlpha: true }, [w, h]);
    const enc = device.createCommandEncoder();
    for (let l = 1; l < levels; l++) {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: texture.createView({ baseMipLevel: l, mipLevelCount: 1 }), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      pass.setPipeline(mipPipeline);
      pass.setBindGroup(0, device.createBindGroup({ layout: mipPipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: mipSampler }, { binding: 1, resource: texture.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) }] }));
      pass.draw(3);
      pass.end();
    }
    queue.submit([enc.finish()]);
    const uniforms = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: sampler }, { binding: 2, resource: texture.createView() }] });
    layers[name] = { texture, uniforms, group, data: new Float32Array(8) };
  };
  const ready = Promise.all([load('wordmark', 'logo-wordmark.png'), load('blob', 'logo-blob.png')]).then(() => {});

  // one layer: source rect (artwork px) → destination px rect, then the clip rect
  function layer(pass, l, L, cSX, cSY, cx, cy, s, W, H, alpha) {
    if (!l) return;
    const x = cx + (L.x - cSX) * s, y = cy + (L.y - cSY) * s, w = L.w * s, h = L.h * s;
    l.data.set([x / W * 2 - 1, 1 - (y + h) / H * 2, (x + w) / W * 2 - 1, 1 - y / H * 2, alpha, 0, 0, 0]);
    queue.writeBuffer(l.uniforms, 0, l.data);
    pass.setBindGroup(0, l.group);
    pass.draw(4);
  }

  return {
    ready,
    /**
     * Draw the logo centred on (cx, cy) (render px, y down) in a W x H canvas.
     * targetH: height of the composition in px (the wordmark with its tagline, or the whole blob art when withBlob);
     * maxW: it is scaled down to fit this width; scale: extra factor (breathing); alpha: 0..1.
     * Returns the drawn rect through `out` ({x, y, w, h}) when given.
     */
    draw(W, H, cx, cy, targetH, maxW, scale, alpha, withBlob, out = null) {
      if (alpha <= 0.001) return;
      const base = withBlob ? LAYOUT.blob : LAYOUT.wordmark;
      let s = targetH / base.h;
      if (base.w * s > maxW) s = maxW / base.w;
      s *= scale;
      const cSX = base.x + base.w / 2, cSY = base.y + base.h / 2;
      if (out) { out.w = base.w * s; out.h = base.h * s; out.x = cx - out.w / 2; out.y = cy - out.h / 2; }
      if (!layers.wordmark && !layers.blob) return;
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'load', storeOp: 'store' }] });
      pass.setPipeline(pipeline);
      if (withBlob) layer(pass, layers.blob, LAYOUT.blob, cSX, cSY, cx, cy, s, W, H, alpha);
      layer(pass, layers.wordmark, LAYOUT.wordmark, cSX, cSY, cx, cy, s, W, H, alpha);
      pass.end();
      queue.submit([enc.finish()]);
    },
    dispose() {
      disposed = true;
      for (const l of Object.values(layers)) if (l) { l.texture.destroy(); l.uniforms.destroy(); }
    },
  };
}
