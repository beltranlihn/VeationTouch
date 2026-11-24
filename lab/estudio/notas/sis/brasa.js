while (!window.__obra) await new Promise((r) => setTimeout(r, 100));
const o = window.__obra, S = o.score.state, room = o.room; o.score.step = () => S;
const w0 = room.walls[0], hy = 1.3, hu = 0.5 + 0.35 / w0.width;
const H = { stroke: 777, wall: 0, u: hu, v: hy / w0.height, pos: room.wallPoint(0, hu, hy / w0.height), normal: w0.normal.clone(), vx: 0, vy: 0, size: 0.1, ended: false };
room.hands = () => [H];
Object.assign(S, { block: 'brasa', phase: 'play', t: 30, tp: 24, touched: 20, people: 4, waves: 1, count: [1, 0, 0, 0], brasaStage: 'touch' });
await new Promise((r) => setTimeout(r, 3500)); return S.block;
