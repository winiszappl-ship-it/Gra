// Skiny są wyłącznie kosmetyczne — nie zmieniają fizyki ani trudności.
export const SKINS = [
  { id: 'flux',    name: 'FLUX',     price: 0,    body: '#22e5ff', glow: '#22e5ff', trail: '#22e5ff', shape: 'square', desc: 'Klasyczny neonowy rdzeń.' },
  { id: 'ember',   name: 'EMBER',    price: 150,  body: '#ff7a3d', glow: '#ff3ea5', trail: '#ff9f45', shape: 'square', desc: 'Rozgrzany do czerwoności.' },
  { id: 'venom',   name: 'VENOM',    price: 300,  body: '#4ef08a', glow: '#9dff5e', trail: '#4ef08a', shape: 'diamond', desc: 'Toksyczny romb.' },
  { id: 'orbit',   name: 'ORBIT',    price: 500,  body: '#e8ecff', glow: '#a78bfa', trail: '#c4b5fd', shape: 'circle', desc: 'Gładka kula z aureolą.' },
  { id: 'magma',   name: 'MAGMA',    price: 800,  body: '#ff3ea5', glow: '#ff005c', trail: '#ff6ec7', shape: 'diamond', desc: 'Pulsuje w rytm combo.' },
  { id: 'gold',    name: 'AUREUS',   price: 1200, body: '#ffd166', glow: '#ffb020', trail: '#ffe9a8', shape: 'circle', desc: 'Złoto dla wytrwałych.' },
  { id: 'void',    name: 'VOID',     price: 1800, body: '#0b0d1c', glow: '#7c3aed', trail: '#8b5cf6', shape: 'square', desc: 'Czarna dziura z fioletową obwódką.' },
  { id: 'prism',   name: 'PRISM',    price: 2600, body: 'rainbow', glow: '#ffffff', trail: 'rainbow', shape: 'circle', desc: 'Przelewa się przez całe widmo.' },
];

export const getSkin = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

export function skinColor(skin, t) {
  if (skin.body !== 'rainbow') return skin.body;
  return `hsl(${(t * 90) % 360},95%,64%)`;
}

export function trailColor(skin, t) {
  if (skin.trail !== 'rainbow') return skin.trail;
  return `hsl(${(t * 90 + 40) % 360},95%,64%)`;
}

// Wspólny rysunek gracza — używany przez grę i podgląd w sklepie.
export function drawSkin(ctx, skin, x, y, size, t, glowStrength = 1) {
  const half = size / 2;
  const col = skinColor(skin, t);
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = skin.glow;
  ctx.shadowBlur = 22 * glowStrength;
  ctx.fillStyle = col;
  ctx.strokeStyle = skin.glow;
  ctx.lineWidth = 2;

  if (skin.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, half + 5 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (skin.shape === 'diamond') {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half * 0.78, -half * 0.78, half * 1.56, half * 1.56);
    ctx.strokeRect(-half * 0.78, -half * 0.78, half * 1.56, half * 1.56);
  } else {
    const r = size * 0.22;
    ctx.beginPath();
    ctx.roundRect(-half, -half, size, size, r);
    ctx.fill();
    ctx.stroke();
  }

  // Wewnętrzny błysk
  ctx.globalAlpha = 0.85;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  ctx.arc(-half * 0.3, -half * 0.3, Math.max(1.5, size * 0.09), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
