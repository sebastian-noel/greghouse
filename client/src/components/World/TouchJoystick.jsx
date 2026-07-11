// v1 #joy: fixed bottom-right square joystick, shown on coarse pointers via
// CSS. Writes char.joy for the game loop.
import { useEffect, useRef } from 'react';
import { char } from '../../state/runtime.js';

const R = 34;

export default function TouchJoystick() {
  const joyRef = useRef(null);
  const knobRef = useRef(null);

  useEffect(() => {
    const joy = joyRef.current, knob = knobRef.current;
    if (!joy) return;
    let id = null, cx = 0, cy = 0;
    const moveKnob = e => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy); if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      char.joy.x = dx / R; char.joy.y = dy / R;
    };
    const onDown = e => {
      e.stopPropagation();
      id = e.pointerId; const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; char.joy.active = true;
      joy.setPointerCapture(id); moveKnob(e);
    };
    const onMove = e => { if (e.pointerId === id) moveKnob(e); };
    const rel = e => {
      if (e.pointerId !== id) return;
      id = null; char.joy = { x: 0, y: 0, active: false };
      knob.style.transform = 'translate(0,0)';
    };
    joy.addEventListener('pointerdown', onDown);
    joy.addEventListener('pointermove', onMove);
    joy.addEventListener('pointerup', rel);
    joy.addEventListener('pointercancel', rel);
    return () => {
      joy.removeEventListener('pointerdown', onDown);
      joy.removeEventListener('pointermove', onMove);
      joy.removeEventListener('pointerup', rel);
      joy.removeEventListener('pointercancel', rel);
    };
  }, []);

  return (
    <div id="joy" ref={joyRef} aria-label="movement joystick">
      <div className="knob" ref={knobRef} />
    </div>
  );
}
