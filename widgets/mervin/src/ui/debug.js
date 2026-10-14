// ?debug=1 overlay: vanishing point, safe margins, fps and render stats.

export function drawDebug(canvas, app, stats) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const lens = app.lens;
  if (!lens) return;
  const vpX = (lens.tanLeft / (lens.tanLeft + lens.tanRight)) * w;
  const vpY = (lens.tanTop / (lens.tanTop + lens.tanBottom)) * h;
  ctx.strokeStyle = "rgba(255, 60, 60, 0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vpX - 14, vpY);
  ctx.lineTo(vpX + 14, vpY);
  ctx.moveTo(vpX, vpY - 14);
  ctx.lineTo(vpX, vpY + 14);
  ctx.stroke();
  ctx.strokeStyle = "rgba(80, 200, 255, 0.6)";
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  ctx.setLineDash([]);
  const lines = [
    `${stats.layout}  ${w}x${h}  fps ${stats.fps}`,
    `calls ${stats.calls}  tris ${stats.triangles}`,
    ...(app.world.debugLines ? app.world.debugLines() : []),
  ];
  ctx.font = "14px Consolas, monospace";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(6, 6, 360, 8 + lines.length * 18);
  ctx.fillStyle = "#9f9";
  lines.forEach((line, i) => ctx.fillText(line, 12, 22 + i * 18));
  if (app.world.drawDebug) app.world.drawDebug(ctx, app.camera, w, h);
}
