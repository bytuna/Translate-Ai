(() => {
  const bridge = window.snipper;
  if (!bridge) return;

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');

  const bg = new Image();
  let isDrawing = false;
  let sx = 0;
  let sy = 0;
  let ready = false;

  function draw(curX, curY) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bg, 0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(0, 0, cv.width, cv.height);

    if (isDrawing && curX !== undefined && curY !== undefined) {
      const rx = Math.min(sx, curX);
      const ry = Math.min(sy, curY);
      const rw = Math.abs(curX - sx);
      const rh = Math.abs(curY - sy);

      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.drawImage(bg, 0, 0, cv.width, cv.height);
      ctx.restore();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') bridge.cancel();
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      bridge.cancel();
      return;
    }
    if (!ready) return;
    isDrawing = true;
    sx = e.clientX;
    sy = e.clientY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    draw(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    const rx = Math.min(sx, e.clientX);
    const ry = Math.min(sy, e.clientY);
    const rw = Math.abs(e.clientX - sx);
    const rh = Math.abs(e.clientY - sy);

    if (rw < 10 || rh < 10) {
      draw();
      return;
    }

    const scaleX = bg.naturalWidth / cv.width;
    const scaleY = bg.naturalHeight / cv.height;

    const cropCv = document.createElement('canvas');
    cropCv.width = Math.round(rw * scaleX);
    cropCv.height = Math.round(rh * scaleY);
    const cropCtx = cropCv.getContext('2d');

    cropCtx.drawImage(
      bg,
      Math.round(rx * scaleX),
      Math.round(ry * scaleY),
      cropCv.width,
      cropCv.height,
      0,
      0,
      cropCv.width,
      cropCv.height
    );

    bridge.done(cropCv.toDataURL('image/png'));
  });

  bridge.onInit((dataUrl) => {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    bg.onload = () => {
      ready = true;
      draw();
    };
    bg.src = dataUrl;
  });
})();
