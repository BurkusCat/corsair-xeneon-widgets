// Signed-distance primitives and operators for sculpting Mervin (Node, build time only).
// Vectors are plain [x, y, z] arrays. Distances are in metres; negative means inside.

export const v = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mirror: (a) => [-a[0], a[1], a[2]],
};

// Polynomial smooth minimum (k is the blend radius).
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

// Each primitive: { dist(x, y, z), centre, reach } where reach bounds the shape from centre.

export function sphere(c, r) {
  return {
    kind: "sphere",
    centre: c,
    reach: r,
    dist(x, y, z) {
      return Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
    },
  };
}

// Axis-aligned or oriented ellipsoid. axes: optional [u, v, w] unit vectors for radii[0..2].
// Uses Inigo Quilez's distance bound, good near the surface.
export function ellipsoid(c, radii, axes = null) {
  const [ra, rb, rc] = radii;
  const [u, vv, w] = axes ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return {
    kind: "ellipsoid",
    centre: c,
    reach: Math.max(ra, rb, rc),
    dist(x, y, z) {
      const px = x - c[0];
      const py = y - c[1];
      const pz = z - c[2];
      const a = (px * u[0] + py * u[1] + pz * u[2]) / ra;
      const b = (px * vv[0] + py * vv[1] + pz * vv[2]) / rb;
      const cc = (px * w[0] + py * w[1] + pz * w[2]) / rc;
      const k0 = Math.hypot(a, b, cc);
      const k1 = Math.hypot(a / ra, b / rb, cc / rc);
      if (k1 < 1e-9) return -Math.min(ra, rb, rc);
      return (k0 * (k0 - 1)) / k1;
    },
  };
}

// Round cone (capsule with different end radii), exact.
export function roundCone(a, b, ra, rb) {
  const ba = v.sub(b, a);
  const l2 = v.dot(ba, ba);
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const centre = v.lerp(a, b, 0.5);
  return {
    kind: "roundCone",
    a,
    b,
    centre,
    reach: Math.sqrt(l2) / 2 + Math.max(ra, rb),
    // Parameter along the axis, 0 at a and 1 at b (for splitting skin weights).
    t(x, y, z) {
      const t = ((x - a[0]) * ba[0] + (y - a[1]) * ba[1] + (z - a[2]) * ba[2]) * il2;
      return Math.min(1, Math.max(0, t));
    },
    dist(x, y, z) {
      const pax = x - a[0];
      const pay = y - a[1];
      const paz = z - a[2];
      const y0 = pax * ba[0] + pay * ba[1] + paz * ba[2];
      const zz = y0 - l2;
      const qx = pax * l2 - ba[0] * y0;
      const qy = pay * l2 - ba[1] * y0;
      const qz = paz * l2 - ba[2] * y0;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = y0 * y0 * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(y0) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + y0 * rr) * il2 - ra;
    },
  };
}

// A flattened round cone (a blade, for ears): the cross-section is squashed along
// `flatAxis` by `flatness` (0..1). Distances are scaled back, so it is a bound.
export function blade(a, b, ra, rb, flatAxis, flatness) {
  const axis = v.norm(v.sub(b, a));
  // Remove the axis component from flatAxis so it is perpendicular.
  const f = v.norm(v.sub(flatAxis, v.scale(axis, v.dot(flatAxis, axis))));
  const cone = roundCone([0, 0, 0], v.sub(b, a), ra, rb);
  const inv = 1 / flatness;
  return {
    kind: "blade",
    a,
    b,
    centre: v.lerp(a, b, 0.5),
    reach: v.len(v.sub(b, a)) / 2 + Math.max(ra, rb),
    t: (x, y, z) => cone.t(x - a[0], y - a[1], z - a[2]),
    dist(x, y, z) {
      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      const along = px * f[0] + py * f[1] + pz * f[2];
      const s = along * (inv - 1);
      return cone.dist(px + f[0] * s, py + f[1] * s, pz + f[2] * s) * flatness;
    },
  };
}
