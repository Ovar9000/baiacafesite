"""
BAIA hero: two drinks side by side, turning slowly on their own, like a
product shot. No pour, no words.

  left   an iced lemon tea in a tall faceted tumbler: amber tea packed with
         ice, lemon slices pressed against the glass, a thin shaken-foam head,
         a cube poking over the rim, condensation on the glass
  right  an Einspanner, modelled on BAIA's own photo: cold milk at the bottom,
         coffee swirling down into it, whipped cream pushed into the coffee
         with coffee running over it, a heap of cream on top marbled with
         coffee, and cocoa dusted over the heap

Both glasses turn a full 360 degrees per loop (the page plays it as a slow,
endless spin); the coffee's swirl drifts a little and comes back, so the last
frame leads into the first.

Renders on a transparent background with a real contact shadow (a shadow
catcher), so the page's time-of-day backdrop and its giant BAIA show behind.

A light card stands behind each glass. Only light passing through a glass
sees it (not the camera, not reflections), so the tea glows amber the way it
does with the sun behind it, instead of showing the page's backdrop through
it.

Run headless from the repo root:

  blender -b -P blender/baia_duo.py -- --preview               # stills at 0, 120, 240 deg
  blender -b -P blender/baia_duo.py -- --closeup tea           # one drink, close
  blender -b -P blender/baia_duo.py -- --spin 360              # the loop: frames-spin/

Units are decimetres. Output goes to blender/out/duo/ (gitignored).
See plans/hero-3d-baia.md.
"""

import argparse
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))

EXPOSURE = -0.6
CONTROLS = {}          # shader inputs the frames drive
DRIFT = 0.08           # how far the coffee's swirl wanders over one loop

# Where the two drinks stand (x, y); the camera looks along +y
TEA_AT = Vector((-0.5, 0.22, 0.0))
EIN_AT = Vector((0.47, -0.2, 0.0))


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="baia_duo.py")
    p.add_argument("--preview", action="store_true", help="render 3 stills")
    p.add_argument("--spin", type=int, default=0, help="render the loop in N frames")
    p.add_argument("--closeup", choices=["tea", "ein", "cream"], help="frame one drink, for checking")
    p.add_argument("--angles", default="0,120,240", help="preview angles, degrees")
    p.add_argument("--samples", type=int, default=None)
    p.add_argument("--width", type=int, default=None)
    p.add_argument("--height", type=int, default=None)
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--out", default=os.path.join(HERE, "out"))
    p.add_argument("--save-blend", action="store_true")
    p.add_argument("--stats", action="store_true", help="print the evaluated meshes and stop")
    a = p.parse_args(argv)
    if not (a.preview or a.spin or a.save_blend or a.closeup or a.stats):
        a.preview = True
    return a


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hex_to_linear(h, alpha=1.0):
    h = h.lstrip("#")

    def ch(v):
        c = int(v, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (ch(h[0:2]), ch(h[2:4]), ch(h[4:6]), alpha)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def set_input(node, names, value):
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return node.inputs[n]
    print(f"[duo] note: no input {names} on {node.name}")
    return None


def link_scene(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def finish_mesh(me, smooth=True, sharp_angle=None):
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if sharp_angle is not None:
        try:
            me.set_sharp_from_angle(angle=sharp_angle)
        except (AttributeError, TypeError):
            pass


def mesh_object(name, verts, faces, mat=None, parent=None, smooth=True, sharp_angle=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    finish_mesh(me, smooth, sharp_angle)
    if mat:
        me.materials.append(mat)
    return link_scene(bpy.data.objects.new(name, me), parent)


def bm_object(name, bm, mat=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    finish_mesh(me, smooth)
    if mat:
        me.materials.append(mat)
    return link_scene(bpy.data.objects.new(name, me), parent)


def lathe(name, profile, point_fn=None, segments=144, mat=None, parent=None, sharp_angle=None):
    """Spin a (r, z) profile around Z. r == 0 makes a single pole vertex.
    point_fn(r, z, theta, i) can reshape each vertex (facets)."""
    verts, faces, rings = [], [], []
    for i, (r, z) in enumerate(profile):
        if r == 0:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for j in range(segments):
            th = 2 * math.pi * j / segments
            p = point_fn(r, z, th, i) if point_fn else (r * math.cos(th), r * math.sin(th), z)
            ring.append(len(verts))
            verts.append(tuple(p))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            faces += [(a[0], b[j], b[(j + 1) % segments]) for j in range(segments)]
        elif len(b) == 1:
            faces += [(a[j], a[(j + 1) % segments], b[0]) for j in range(segments)]
        else:
            faces += [(a[j], a[(j + 1) % segments], b[(j + 1) % segments], b[j]) for j in range(segments)]
    return mesh_object(name, verts, faces, mat, parent, sharp_angle=sharp_angle)


def ray_only(ob, camera=True, diffuse=True, glossy=True, transmission=True, shadow=True, volume=True):
    ob.visible_camera = camera
    ob.visible_diffuse = diffuse
    ob.visible_glossy = glossy
    ob.visible_transmission = transmission
    ob.visible_shadow = shadow
    ob.visible_volume_scatter = volume
    return ob


def no_shadow(ob):
    """Clear things cast no shadow: with caustics off, a shadow-casting glass
    or tea would leave everything inside it in the dark. A hidden disc in the
    glass's base casts the contact shadow instead."""
    ob.visible_shadow = False
    return ob


# ---------------------------------------------------------------------------
# Node helpers
# ---------------------------------------------------------------------------
class Nodes:
    """Small helpers for building a node tree in code."""

    def __init__(self, nt):
        self.nt = nt

    def node(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        for k, v in inputs.items():
            self.put(n.inputs[k], v)
        return n

    def put(self, socket, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, socket)
        elif isinstance(v, str):
            socket.default_value = hex_to_linear(v)
        else:
            socket.default_value = v

    def math(self, op, a, b=None, clamp=False):
        n = self.nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is not None:
                self.put(n.inputs[i], v)
        return n.outputs[0]

    def add(self, a, b): return self.math("ADD", a, b)
    def sub(self, a, b): return self.math("SUBTRACT", a, b)
    def mul(self, a, b, clamp=False): return self.math("MULTIPLY", a, b, clamp)
    def mx(self, a, b): return self.math("MAXIMUM", a, b)

    def map(self, v, fmin, fmax, tmin=0.0, tmax=1.0, smooth=False):
        n = self.nt.nodes.new("ShaderNodeMapRange")
        n.clamp = True
        if smooth:
            n.interpolation_type = "SMOOTHSTEP"
        self.put(n.inputs["Value"], v)
        self.put(n.inputs["From Min"], fmin)
        self.put(n.inputs["From Max"], fmax)
        self.put(n.inputs["To Min"], tmin)
        self.put(n.inputs["To Max"], tmax)
        return n.outputs["Result"]

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0):
        n = self.nt.nodes.new("ShaderNodeTexNoise")
        if vec is not None:
            self.put(n.inputs["Vector"], vec)
        set_input(n, "Scale", scale)
        set_input(n, "Detail", detail)
        set_input(n, "Roughness", rough)
        set_input(n, "Distortion", distortion)
        return n.outputs["Fac"]

    def voronoi(self, vec, scale, feature="F1", out="Distance"):
        n = self.nt.nodes.new("ShaderNodeTexVoronoi")
        n.feature = feature
        if vec is not None:
            self.put(n.inputs["Vector"], vec)
        set_input(n, "Scale", scale)
        return n.outputs[out]

    def mix(self, fac, a, b):
        m = self.nt.nodes.new("ShaderNodeMix")
        m.data_type = "RGBA"
        self.put(m.inputs["Factor"], fac)
        self.put(m.inputs[6], a)
        self.put(m.inputs[7], b)
        return m.outputs[2]

    def ramp(self, fac, stops):
        r = self.nt.nodes.new("ShaderNodeValToRGB")
        els = r.color_ramp.elements
        els[0].position, els[0].color = stops[0][0], hex_to_linear(stops[0][1])
        els[1].position, els[1].color = stops[-1][0], hex_to_linear(stops[-1][1])
        for pos, col in stops[1:-1]:
            els.new(pos).color = hex_to_linear(col)
        self.put(r.inputs["Fac"], fac)
        return r.outputs["Color"]

    def sep(self, vec):
        n = self.nt.nodes.new("ShaderNodeSeparateXYZ")
        self.put(n.inputs["Vector"], vec)
        return n.outputs

    def vmul(self, vec, scale):
        n = self.nt.nodes.new("ShaderNodeVectorMath")
        n.operation = "MULTIPLY"
        self.put(n.inputs[0], vec)
        n.inputs[1].default_value = scale
        return n.outputs["Vector"]

    def vadd(self, vec, other):
        n = self.nt.nodes.new("ShaderNodeVectorMath")
        n.operation = "ADD"
        self.put(n.inputs[0], vec)
        self.put(n.inputs[1], other)
        return n.outputs["Vector"], n.inputs[1]

    def twist(self, vec, z, turns):
        """Rotate vec about Z by an angle that grows with height: the noise
        then spirals, like coffee stirred down into milk."""
        n = self.nt.nodes.new("ShaderNodeVectorRotate")
        n.rotation_type = "Z_AXIS"
        self.put(n.inputs["Vector"], vec)
        self.put(n.inputs["Angle"], self.mul(z, turns))
        return n.outputs["Vector"]

    def bump(self, height, strength, distance=0.02, normal=None):
        b = self.nt.nodes.new("ShaderNodeBump")
        set_input(b, "Strength", strength)
        set_input(b, "Distance", distance)
        self.put(b.inputs["Height"], height)
        if normal is not None:
            self.put(b.inputs["Normal"], normal)
        return b.outputs["Normal"]


def principled(name, color, **kw):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    set_input(bsdf, "Base Color", hex_to_linear(color))
    names = {
        "roughness": "Roughness",
        "ior": "IOR",
        "transmission": ["Transmission Weight", "Transmission"],
        "subsurface": ["Subsurface Weight", "Subsurface"],
        "sss_radius": "Subsurface Radius",
        "sss_scale": "Subsurface Scale",
        "coat": ["Coat Weight", "Clearcoat"],
        "coat_roughness": ["Coat Roughness", "Clearcoat Roughness"],
        "sheen": ["Sheen Weight", "Sheen"],
        "sheen_roughness": "Sheen Roughness",
        "specular": ["Specular IOR Level", "Specular"],
    }
    for k, v in kw.items():
        set_input(bsdf, names[k], v)
    return mat, bsdf


# ---------------------------------------------------------------------------
# Glass
# ---------------------------------------------------------------------------
class Tumbler:
    """A Picardie-style tumbler: tapered, with flat panels round the lower
    part that fade into a smooth band, a thick base and a rounded lip."""

    def __init__(self, height, r_bottom, r_top, facets=12, facet_top=0.6, wall=0.022, base=0.12):
        self.h, self.rb, self.rt = height, r_bottom, r_top
        self.facets, self.facet_top = facets, facet_top
        self.wall, self.base = wall, base

    def r_outer(self, z):
        # The band above the panels sits a hair proud of them, as on the real glass
        band = 0.007 * smoothstep(self.facet_top - 0.02, self.facet_top + 0.03, z)
        return self.rb + (self.rt - self.rb) * (z / self.h) + band

    def facet_scale(self, th):
        half = math.pi / self.facets
        local = (th % (2 * half)) - half
        return math.cos(half) / math.cos(local)

    def facet_blend(self, z):
        return 1.0 - smoothstep(self.facet_top - 0.035, self.facet_top + 0.015, z)

    def outer_point(self, r, z, th):
        s = 1.0 + self.facet_blend(z) * (self.facet_scale(th) - 1.0)
        return (r * s * math.cos(th), r * s * math.sin(th), z)

    def r_inner(self, z):
        return self.r_outer(z) * math.cos(math.pi / self.facets) - self.wall

    def outer_normal(self, z, th):
        half = math.pi / self.facets
        facet_th = th - ((th % (2 * half)) - half)
        nth = facet_th + (th - facet_th) * (1 - self.facet_blend(z))
        return Vector((math.cos(nth), math.sin(nth), 0.0))


def make_glass(tum, mat, parent, name):
    h = tum.h
    outer = [(0.0, 0.0), (tum.rb - 0.035, 0.0), (tum.rb - 0.012, 0.004), (tum.rb - 0.002, 0.014)]
    z = 0.03
    while z < h - 0.03:
        outer.append((tum.r_outer(z), z))
        z += 0.025
    n_outer = len(outer)
    # A rounded lip: a half circle from the outside over to the inside
    ro, ri = tum.r_outer(h - 0.01), tum.r_inner(h - 0.01)
    cx, rr = (ro + ri) / 2, (ro - ri) / 2
    lip = []
    for k in range(9):
        a = math.pi * k / 8
        lip.append((cx + rr * math.cos(a), h - 0.012 + rr * 0.9 * math.sin(a)))
    inner = []
    z = h - 0.03
    while z > tum.base + 0.03:
        inner.append((tum.r_inner(z), z))
        z -= 0.03
    # The inside floor dips a little, as on a pressed glass
    inner += [(tum.r_inner(tum.base + 0.012), tum.base + 0.012), (tum.r_inner(tum.base) - 0.02, tum.base),
              (0.12, tum.base - 0.006), (0.0, tum.base - 0.012)]

    def point(r, zz, th, i):
        if i < n_outer:
            return tum.outer_point(r, zz, th)
        return (r * math.cos(th), r * math.sin(th), zz)

    ob = lathe(name, outer + lip + inner, point, segments=tum.facets * 12, mat=mat, parent=parent,
               sharp_angle=math.radians(24))
    return no_shadow(ob)


def make_liquid_shell(tum, top, mat, parent, name, gap=0.004, bottom=None):
    """The volume a liquid fills: inside the glass, from the floor up to `top`
    (a flat surface with a little meniscus)."""
    z0 = (bottom if bottom is not None else tum.base) + 0.002
    prof = [(0.0, z0 - 0.01), (0.1, z0 - 0.004), (tum.r_inner(tum.base) - 0.024, z0), (tum.r_inner(z0 + 0.014) - gap, z0 + 0.014)]
    z = z0 + 0.04
    while z < top - 0.012:
        prof.append((tum.r_inner(z) - gap, z))
        z += 0.04
    prof += [(tum.r_inner(top) - gap, top - 0.002), (tum.r_inner(top) - gap - 0.014, top - 0.008),
             (tum.r_inner(top) - 0.06, top - 0.012), (0.0, top - 0.012)]
    return lathe(name, prof, mat=mat, parent=parent, segments=128)


def bead_template(u=10, v=6):
    """A unit UV sphere as plain lists (bmesh's sphere op slows to minutes
    when called hundreds of times into one mesh)."""
    verts = [(0.0, 0.0, -1.0)]
    for k in range(1, v):
        phi = -math.pi / 2 + math.pi * k / v
        for j in range(u):
            th = 2 * math.pi * j / u
            verts.append((math.cos(phi) * math.cos(th), math.cos(phi) * math.sin(th), math.sin(phi)))
    verts.append((0.0, 0.0, 1.0))
    top = len(verts) - 1
    faces = [(0, 1 + (j + 1) % u, 1 + j) for j in range(u)]
    for k in range(v - 2):
        a, b = 1 + k * u, 1 + (k + 1) * u
        faces += [(a + j, a + (j + 1) % u, b + (j + 1) % u, b + j) for j in range(u)]
    last = 1 + (v - 2) * u
    faces += [(last + j, last + (j + 1) % u, top) for j in range(u)]
    return verts, faces


def make_condensation(tum, mat, parent, rng, count, z_max, name):
    """Beads of water on the cold part of the glass: mostly tiny, a few fat
    ones, a few that have started to run."""
    tv, tf = bead_template()
    verts, faces = [], []
    for _ in range(count):
        z = rng.uniform(0.03, z_max)
        th = rng.uniform(0, 2 * math.pi)
        size = 0.003 + rng.random() ** 3.2 * 0.016
        x, y, _ = tum.outer_point(tum.r_outer(z), z, th)
        normal = tum.outer_normal(z, th)
        pos = Vector((x, y, z)) + normal * size * 0.3
        streak = rng.random() < 0.05
        stretch = rng.uniform(2.5, 5.5) if streak else rng.uniform(1.0, 1.2)
        rot = normal.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m = Matrix.Translation(pos) @ rot @ Matrix.Diagonal((size, size * stretch, size * 0.4, 1))
        if streak:
            m = Matrix.Translation((0, 0, -size * stretch * 0.6)) @ m
        base = len(verts)
        verts += [tuple(m @ Vector(c)) for c in tv]
        faces += [tuple(base + q for q in f) for f in tf]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    finish_mesh(me)
    me.materials.append(mat)
    return no_shadow(link_scene(bpy.data.objects.new(name, me), parent))


def make_ice(cubes, mat, parent, name, rng):
    """cubes: list of (position, size). Rounded, slightly squashed cubes."""
    bm = bmesh.new()
    for pos, size in cubes:
        rot = (Matrix.Rotation(rng.uniform(-0.6, 0.6), 4, "X")
               @ Matrix.Rotation(rng.uniform(0, math.pi), 4, "Z")
               @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, "Y"))
        sx, sy, sz = (size * rng.uniform(0.88, 1.08) for _ in range(3))
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.bevel(tmp, geom=list(tmp.verts) + list(tmp.edges), offset=0.17, segments=3,
                        affect="EDGES", profile=0.55)
        m = Matrix.Translation(pos) @ rot @ Matrix.Diagonal((sx, sy, sz, 1))
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        me = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    ice = no_shadow(bm_object(name, bm, mat, parent))
    sub = ice.modifiers.new("Soft", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    return ice


def cut(ob, holes):
    mod = ob.modifiers.new("Holes", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = holes
    for solver in ("EXACT", "MANIFOLD", "FAST", "FLOAT"):
        try:
            mod.solver = solver
            break
        except TypeError:
            continue
    return mod


def shadow_disc(tum, parent, name):
    """Hidden from everything but shadows: a short cylinder in the glass's
    base that casts the contact shadow under the drink."""
    prof = [(0.0, 0.004), (tum.rb - 0.02, 0.004), (tum.rb - 0.03, 0.3), (0.0, 0.3)]
    ob = lathe(name, prof, segments=48, parent=parent)
    return ray_only(ob, camera=False, diffuse=False, glossy=False, transmission=False, shadow=True, volume=False)


def glow_card(at, width, height, strength, name, color="#FFF1DC"):
    """A soft warm light card behind a glass, seen only by light passing
    through the glass (not the camera, not reflections)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    N = Nodes(nt)
    coord = N.node("ShaderNodeTexCoord")
    u, v, _ = N.sep(coord.outputs["UV"])
    # Brightest in the middle, falling off to the edges like a softbox
    fu = N.map(N.math("ABSOLUTE", N.sub(u, 0.5)), 0.12, 0.5, 1.0, 0.25, smooth=True)
    fv = N.map(N.math("ABSOLUTE", N.sub(v, 0.5)), 0.2, 0.5, 1.0, 0.4, smooth=True)
    em = N.node("ShaderNodeEmission", Color=color)
    nt.links.new(N.mul(N.mul(fu, fv), strength), em.inputs["Strength"])
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    nt.links.new(em.outputs[0], out.inputs["Surface"])

    # A shallow curve behind the glass, facing the camera
    segs, rows = 24, 2
    verts, faces, uvs = [], [], []
    for r in range(rows + 1):
        for s in range(segs + 1):
            fx = s / segs - 0.5
            ang = fx * math.radians(80)
            radius = width / math.radians(80)
            x = radius * math.sin(ang)
            y = radius * (1 - math.cos(ang)) * -1.0
            verts.append((at.x + x, at.y + 0.75 + y, -0.15 + height * r / rows))
            uvs.append((s / segs, r / rows))
    for r in range(rows):
        for s in range(segs):
            a = r * (segs + 1) + s
            faces.append((a, a + 1, a + segs + 2, a + segs + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(mat)
    ob = link_scene(bpy.data.objects.new(name, me))
    return ray_only(ob, camera=False, diffuse=False, glossy=False, transmission=True, shadow=False, volume=False)


# ---------------------------------------------------------------------------
# Shared materials
# ---------------------------------------------------------------------------
def glass_material():
    mat, bsdf = principled("Glass", "#FFFFFF", roughness=0.0, ior=1.52, transmission=1.0)
    return mat


def water_material():
    mat, _ = principled("Condensation", "#FFFFFF", roughness=0.0, ior=1.33, transmission=1.0)
    return mat


def ice_material():
    mat, bsdf = principled("Ice", "#FBFDFF", roughness=0.04, ior=1.31, transmission=1.0)
    N = Nodes(mat.node_tree)
    coord = N.node("ShaderNodeTexCoord")
    # Melting ice: soft dents and a few fine cracks
    h = N.add(N.noise(coord.outputs["Object"], 7.0, 3.0, 0.55), N.mul(N.voronoi(coord.outputs["Object"], 22.0, "DISTANCE_TO_EDGE"), 0.6))
    mat.node_tree.links.new(N.bump(h, 0.25, 0.01), bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------------------
# Iced lemon tea
# ---------------------------------------------------------------------------
TEA_GLASS = Tumbler(height=1.6, r_bottom=0.30, r_top=0.445, facets=12, facet_top=1.0, wall=0.024, base=0.13)
TEA_TOP = 1.5          # the tea's surface
TEA_FOAM = 0.05        # the shaken foam on it
LEMONS = ((1.16, -math.pi / 2 + 0.15), (0.78, math.pi / 2 + 0.4))   # (height, angle) of each wheel


def tea_material():
    """Clear amber tea: the colour comes from the depth of tea the light goes
    through (thin at the edges, deep in the middle), as in a real glass."""
    mat, bsdf = principled("Tea", "#FFF6EC", roughness=0.0, ior=1.335, transmission=1.0)
    nt = mat.node_tree
    vol = nt.nodes.new("ShaderNodeVolumeAbsorption")
    vol.inputs["Color"].default_value = hex_to_linear("#EEC200")
    vol.inputs["Density"].default_value = 9.0
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    if hasattr(mat, "cycles") and hasattr(mat.cycles, "homogeneous_volume"):
        mat.cycles.homogeneous_volume = True
    return mat


def tea_foam_material():
    mat, bsdf = principled("Tea foam", "#E9D2AE", roughness=0.35, subsurface=0.6,
                           sss_radius=(1.0, 0.7, 0.45), sss_scale=0.02, sheen=0.3)
    N = Nodes(mat.node_tree)
    coord = N.node("ShaderNodeTexCoord")
    # Tiny bubbles, a few bigger ones, and darker tea showing between them
    bubbles = N.voronoi(coord.outputs["Object"], 90.0)
    big = N.voronoi(coord.outputs["Object"], 26.0)
    h = N.add(N.mul(bubbles, 0.6), N.mul(big, 0.4))
    tone = N.noise(coord.outputs["Object"], 11.0, 2.0, 0.5)
    color = N.mix(N.map(tone, 0.4, 0.7), "#F2E2C4", "#D6AE7C")
    mat.node_tree.links.new(color, bsdf.inputs["Base Color"])
    mat.node_tree.links.new(N.bump(h, 0.5, 0.01), bsdf.inputs["Normal"])
    return mat


def lemon_material():
    """A lemon wheel from its UVs: rind, pith, ten juicy segments with pale
    membranes between them, and a pale core."""
    mat, bsdf = principled("Lemon", "#E8B048", roughness=0.3, subsurface=0.85,
                           sss_radius=(1.0, 0.7, 0.3), sss_scale=0.04, coat=0.3, coat_roughness=0.08)
    nt = mat.node_tree
    N = Nodes(nt)
    coord = N.node("ShaderNodeTexCoord")
    u, v, _ = N.sep(coord.outputs["UV"])
    x, y = N.sub(u, 0.5), N.sub(v, 0.5)
    r = N.mul(N.math("SQRT", N.add(N.mul(x, x), N.mul(y, y))), 2.0)
    ang = N.math("ARCTAN2", y, x)
    seg = N.math("FRACT", N.mul(N.add(ang, math.pi), 10 / (2 * math.pi)))
    membrane = N.map(N.add(N.math("ABSOLUTE", N.sub(seg, 0.5)), N.mul(N.sub(N.noise(coord.outputs["UV"], 18.0), 0.5), 0.05)), 0.44, 0.495)
    rind = N.map(r, 0.9, 0.93)
    pith = N.mul(N.map(r, 0.8, 0.84), N.sub(1.0, rind), clamp=True)
    core = N.map(r, 0.12, 0.06)
    pale = N.mx(N.mx(membrane, core), pith)
    # Juice cells
    cells = N.voronoi(coord.outputs["UV"], 70.0)
    flesh = N.mix(N.map(cells, 0.1, 0.5), "#EDB650", "#D48E2A")
    col = N.mix(N.mul(pale, 0.75), flesh, "#EEDCAE")
    col = N.mix(rind, col, "#CF9A1E")
    nt.links.new(col, bsdf.inputs["Base Color"])
    nt.links.new(N.map(rind, 0.0, 1.0, 0.7, 0.0), bsdf.inputs["Subsurface Weight"])
    nt.links.new(N.bump(N.add(N.mul(cells, 0.5), N.mul(pale, 0.6)), 0.35, 0.01), bsdf.inputs["Normal"])
    return mat


def make_lemon(tum, z_c, angle, radius, thickness, mat, parent, name, inset=0.012):
    """A lemon wheel pressed against the inside of the glass, bent to its
    curve (inset: how far its outer face sits from the glass)."""
    segs, rings = 64, 8
    verts, faces, uvs = [], [], []
    layers = []
    for side in (-0.5, 0.5):
        layer = [len(verts)]
        verts.append((0.0, 0.0, side * thickness))
        uvs.append((0.5, 0.5))
        for k in range(1, rings + 1):
            rr = radius * k / rings
            for s in range(segs):
                a = 2 * math.pi * s / segs
                layer.append(len(verts))
                verts.append((rr * math.cos(a), rr * math.sin(a), side * thickness))
                uvs.append((0.5 + 0.5 * k / rings * math.cos(a), 0.5 + 0.5 * k / rings * math.sin(a)))
        layers.append(layer)
    for li, layer in enumerate(layers):
        flip = li == 0
        for s in range(segs):
            f = (layer[0], layer[1 + s], layer[1 + (s + 1) % segs])
            faces.append(f[::-1] if flip else f)
        for k in range(rings - 1):
            for s in range(segs):
                a = layer[1 + k * segs + s]
                b = layer[1 + k * segs + (s + 1) % segs]
                c = layer[1 + (k + 1) * segs + (s + 1) % segs]
                d = layer[1 + (k + 1) * segs + s]
                f = (a, b, c, d)
                faces.append(f[::-1] if flip else f)
    base0, base1 = 1 + (rings - 1) * segs, 1 + (rings - 1) * segs
    for s in range(segs):
        a = layers[0][base0 + s]
        b = layers[0][base0 + (s + 1) % segs]
        c = layers[1][base1 + (s + 1) % segs]
        d = layers[1][base1 + s]
        faces.append((a, b, c, d))
    # Bend onto the glass: u runs round the wall, v up it, w inwards
    bent = []
    for (px, py, pz) in verts:
        z = z_c + py
        wall = tum.r_inner(z) - inset - (pz + thickness / 2)
        a = angle + px / wall
        bent.append((wall * math.cos(a), wall * math.sin(a), z))
    me = bpy.data.meshes.new(name)
    me.from_pydata(bent, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    finish_mesh(me)
    if mat:
        me.materials.append(mat)
    return link_scene(bpy.data.objects.new(name, me), parent)


def make_tea(mats, rng):
    spin = link_scene(bpy.data.objects.new("Tea spin", None))
    spin.location = TEA_AT
    tum = TEA_GLASS
    make_glass(tum, mats["glass"], spin, "Tea glass")
    make_condensation(tum, mats["water"], spin, rng, 900, TEA_TOP - 0.04, "Tea condensation")
    shadow_disc(tum, spin, "Tea shadow")

    # Packed with ice, top to bottom, and one cube riding over the rim
    cubes = []
    z = tum.base + 0.13
    layer = 0
    while z < TEA_TOP - 0.06:
        r_in = tum.r_inner(z)
        size = min(0.2, (r_in - 0.03) * 0.78)
        off = rng.uniform(0, 2 * math.pi) + layer * 0.9
        for k in range(3):
            a = off + 2 * math.pi * k / 3 + rng.uniform(-0.25, 0.25)
            rad = r_in - size * 0.72 - 0.01
            cubes.append((Vector((rad * math.cos(a), rad * math.sin(a), z + rng.uniform(-0.03, 0.03))), size))
        z += size * 0.92
        layer += 1
    cubes.append((Vector((0.08, -0.02, TEA_TOP + 0.05)), 0.2))
    cubes.append((Vector((-0.15, 0.12, TEA_TOP - 0.01)), 0.19))
    make_ice(cubes, mats["ice"], spin, "Tea ice", rng)

    # Two lemon wheels against the glass, on opposite sides, so one is
    # always somewhere in view as it turns
    for k, (zc, ang) in enumerate(LEMONS):
        make_lemon(tum, zc, ang, 0.23, 0.034, mats["lemon"], spin, f"Lemon {k}")

    tea = make_liquid_shell(tum, TEA_TOP, mats["tea"], spin, "Tea")
    no_shadow(tea)

    # The shaken foam head: a thin layer clinging to the glass
    prof = []
    rt = tum.r_inner(TEA_TOP) - 0.004
    prof.append((0.0, TEA_TOP - 0.012))
    prof.append((rt - 0.02, TEA_TOP - 0.012))
    prof.append((rt, TEA_TOP - 0.004))
    prof.append((rt + 0.0015, TEA_TOP + TEA_FOAM * 0.9))
    prof.append((rt - 0.012, TEA_TOP + TEA_FOAM * 1.15))
    prof.append((rt - 0.05, TEA_TOP + TEA_FOAM * 1.0))
    prof.append((rt * 0.6, TEA_TOP + TEA_FOAM * 0.85))
    prof.append((0.0, TEA_TOP + TEA_FOAM * 0.8))
    foam = lathe("Tea foam", prof, mat=mats["tea_foam"], parent=spin, segments=128)
    disp = foam.modifiers.new("Bubbly", "DISPLACE")
    tex = bpy.data.textures.new("Foam lumps", type="CLOUDS")
    tex.noise_scale = 0.05
    disp.texture = tex
    disp.strength = 0.012
    disp.texture_coords = "OBJECT"
    return spin


# ---------------------------------------------------------------------------
# Einspanner
# ---------------------------------------------------------------------------
EIN_GLASS = Tumbler(height=1.32, r_bottom=0.33, r_top=0.43, facets=12, facet_top=0.36, wall=0.022, base=0.12)
MILK_TOP = 0.47         # cold milk below, coffee above (with a swirled border)
COFFEE_TOP = 1.2        # the coffee's surface, just under the rim; cream floats in it


def ein_liquid_material():
    """Milk below, coffee above, and a wavy border where the coffee sinks into
    the milk in soft tendrils, as in the photo. Milk scatters light; coffee
    lets a little through, so it glows amber at the edges."""
    mat, bsdf = principled("Einspanner", "#A8703E", roughness=0.04, ior=1.34,
                           sss_radius=(1.0, 0.82, 0.62), sss_scale=0.012)
    nt = mat.node_tree
    N = Nodes(nt)
    coord = N.node("ShaderNodeTexCoord")
    obj = coord.outputs["Object"]
    drifted, drift_in = N.vadd(obj, (0.0, 0.0, 0.0))
    CONTROLS["drift"] = drift_in
    z = N.sep(obj)[2]
    tw = N.twist(drifted, z, 0.6)
    big = N.noise(tw, 2.6, 4.0, 0.55, 0.8)
    tendril = N.noise(tw, 6.0, 5.0, 0.55, 1.0)
    warp = N.add(N.mul(N.sub(big, 0.5), 0.2), N.mul(N.sub(tendril, 0.5), 0.07))
    zz = N.add(z, warp)
    t = N.map(zz, MILK_TOP - 0.025, MILK_TOP + 0.035, smooth=True)
    # Coffee a touch lighter where it meets the milk, deeper towards the top
    deep = N.map(z, MILK_TOP + 0.05, COFFEE_TOP, 0.0, 1.0)
    coffee = N.mix(deep, "#DB9A50", "#BC7B38")
    col = N.mix(t, "#F2EEE7", coffee)
    # A milky haze lingers in the coffee just above the border
    haze = N.mul(N.map(zz, MILK_TOP + 0.06, MILK_TOP + 0.24, 0.5, 0.0), N.map(tendril, 0.42, 0.62))
    col = N.mix(haze, col, "#D9BF9C")
    nt.links.new(col, bsdf.inputs["Base Color"])
    clear = N.mul(t, 0.1)
    nt.links.new(clear, bsdf.inputs["Transmission Weight"])
    nt.links.new(N.map(t, 0.0, 1.0, 0.95, 0.15), bsdf.inputs["Subsurface Weight"])
    # Milk scatters deep and soft, coffee shallow
    nt.links.new(N.map(t, 0.0, 1.0, 0.035, 0.008), bsdf.inputs["Subsurface Scale"])
    return mat


def cream_material():
    """Whipped cream as in the photo: a smooth white dollop on top, a cushion
    of foam soaked tan with coffee around it (lighter swirls in it), white
    blobs pushed down into the coffee with coffee running over them, and
    cocoa dusted over what faces up."""
    mat, bsdf = principled("Cream", "#F3EEE5", roughness=0.4, subsurface=0.5,
                           sss_radius=(1.0, 0.95, 0.9), sss_scale=0.02, coat=0.15, coat_roughness=0.3,
                           sheen=0.15, sheen_roughness=0.4)
    nt = mat.node_tree
    N = Nodes(nt)
    coord = N.node("ShaderNodeTexCoord")
    geo = N.node("ShaderNodeNewGeometry")
    obj = coord.outputs["Object"]
    z = N.sep(obj)[2]          # 0 at the coffee's surface; rim at +0.12

    # Fine, soft lumps (whipped, not piped)
    lumps = N.add(N.noise(obj, 4.0, 3.0, 0.5), N.mul(N.noise(obj, 60.0, 2.0, 0.5), 0.2))

    # The cushion between the blobs and the dollop is foam soaked with coffee
    edge = N.noise(obj, 9.0, 3.0, 0.5, 0.6)
    zj = N.add(z, N.mul(N.sub(edge, 0.5), 0.08))
    cushion = N.mul(N.map(zj, 0.05, 0.1), N.map(zj, 0.24, 0.19), clamp=True)
    swirl = N.noise(N.twist(obj, z, 3.0), 6.0, 5.0, 0.55, 1.6)
    soaked = N.mul(cushion, N.map(swirl, 0.3, 0.6, 0.72, 1.0), clamp=True)
    # Coffee running down the blobs under the surface
    streak = N.noise(N.vmul(obj, (1.0, 1.0, 0.15)), 12.0, 2.0, 0.5)
    drips = N.mul(N.map(streak, 0.58, 0.68, 0.0, 0.8), N.map(z, 0.09, 0.03), clamp=True)
    stain = N.mx(soaked, drips)
    tan = N.mix(N.map(N.noise(obj, 7.0), 0.3, 0.7), "#CC9A66", "#B37C48")
    base = N.mix(stain, "#F4EFE7", tan)

    # Under the coffee's surface: white blobs hang down against the glass,
    # and between and below them it is coffee
    flat = N.vmul(obj, (1.0, 1.0, 0.0))
    lobe = N.map(N.noise(flat, 3.2, 2.0, 0.5, 0.3), 0.36, 0.62, smooth=True)
    bottom = N.sub(-0.015, N.mul(lobe, 0.14))
    wobble = N.mul(N.sub(N.noise(obj, 30.0, 2.0, 0.5), 0.5), 0.02)
    coffee = N.map(N.add(z, wobble), N.sub(bottom, 0.01), N.add(bottom, 0.01), 1.0, 0.0, smooth=True)
    coffee_col = N.mix(N.map(z, -0.17, -0.02), "#A86A30", "#B9814A")
    base = N.mix(coffee, base, coffee_col)

    # Cocoa: dense fine specks on top of the dollop, a light scatter on the
    # foam, only on what faces up
    nz = N.sep(geo.outputs["Normal"])[2]
    up = N.map(nz, 0.45, 0.9)
    where = N.map(z, 0.16, 0.32, 0.2, 1.0)
    specks = N.map(N.noise(obj, 120.0, 1.0, 0.5), 0.545, 0.6)
    fine = N.map(N.noise(obj, 240.0, 1.0, 0.5), 0.56, 0.61)
    haze = N.mul(N.map(N.noise(obj, 30.0, 2.0, 0.5), 0.5, 0.7), 0.25)
    patch = N.map(N.noise(obj, 2.5, 2.0, 0.5), 0.15, 0.35)
    amount = N.mul(N.mul(N.mx(N.mx(specks, fine), haze), patch), N.mul(up, where), clamp=True)
    col = N.mix(amount, base, "#7E3216")
    nt.links.new(col, bsdf.inputs["Base Color"])
    nt.links.new(N.math("MINIMUM", N.map(amount, 0.0, 1.0, 0.4, 0.9), N.map(coffee, 0.0, 1.0, 1.0, 0.06)), bsdf.inputs["Roughness"])
    nt.links.new(N.mx(N.map(stain, 0.0, 1.0, 0.15, 0.45), N.mul(coffee, 0.7)), bsdf.inputs["Coat Weight"])
    nt.links.new(N.map(coffee, 0.0, 1.0, 0.5, 0.12), bsdf.inputs["Subsurface Weight"])
    nt.links.new(N.bump(N.add(lumps, N.mul(amount, 0.1)), 0.3, 0.02), bsdf.inputs["Normal"])
    return mat


def make_cream(tum, mat, parent):
    """Three parts, all with their origin on the coffee's surface (just under
    the rim), so the cream shader can tell them apart by height:
      the cushion  coffee-soaked foam filling the glass's mouth and swelling
                   just over the rim (a lathe, roughed up)
      the blobs    white cream pushed down into the coffee against the glass
      the dollop   one smooth oval of cream on top, leaning forward, with a
                   fold in it, dusted with cocoa"""
    rim = tum.h - COFFEE_TOP

    def r_in(zrel):
        # A little in from the glass, so the lumps never poke through it
        return tum.r_inner(COFFEE_TOP + zrel) - 0.018

    # The lower edge hangs into the coffee in lobes against the glass (the
    # blobs in the photo), and is pulled up between them
    deep = -0.17
    prof = [(0.0, -0.03), (r_in(-0.03) * 0.55, -0.03), (r_in(deep) - 0.05, deep + 0.005),
            (r_in(deep) - 0.012, deep - 0.002)]
    z = deep + 0.02
    while z < rim - 0.005:
        prof.append((r_in(z), z))
        z += 0.02
    top = rim + 0.1
    prof += [(r_in(rim) + 0.006, rim + 0.012), (r_in(rim) + 0.004, rim + 0.035),
             (r_in(rim) - 0.012, rim + 0.06), (r_in(rim) - 0.05, rim + 0.085),
             (r_in(rim) - 0.12, top - 0.004), (0.15, top), (0.0, top + 0.002)]
    lobes = (0.2, 1.25, 2.2, 3.3, 4.25, 5.3)
    widths = (0.55, 0.46, 0.6, 0.48, 0.55, 0.5)

    def lobe(th):
        best = 0.0
        for a, w in zip(lobes, widths):
            d = (th - a + math.pi) % (2 * math.pi) - math.pi
            best = max(best, math.exp(-(d / w) ** 4))
        return best

    def point(r, zz, th, i):
        return (r * math.cos(th), r * math.sin(th), zz)

    cushion = lathe("Cream cushion", prof, point, mat=mat, parent=parent, segments=128)
    cushion.location = (0.0, 0.0, COFFEE_TOP)
    sub = cushion.modifiers.new("Smooth", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    disp = cushion.modifiers.new("Lumps", "DISPLACE")
    tex = bpy.data.textures.new("Cream lumps", type="CLOUDS")
    tex.noise_scale = 0.09
    tex.noise_depth = 2
    disp.texture = tex
    disp.texture_coords = "OBJECT"
    disp.strength = 0.022
    disp.mid_level = 0.5

    def metaballs(name, elements, resolution=0.01):
        mb = bpy.data.metaballs.new(name)
        mb.resolution = 0.03
        mb.render_resolution = resolution
        mb.threshold = 0.6
        for co, r, size, stiff, rot in elements:
            el = mb.elements.new()
            el.co = co
            el.radius = r
            el.stiffness = stiff
            if size:
                el.type = "ELLIPSOID"
                el.size_x, el.size_y, el.size_z = size
            if rot is not None:
                el.rotation = rot
        ob = bpy.data.objects.new(name, mb)
        link_scene(ob, parent)
        ob.location = (0.0, 0.0, COFFEE_TOP)
        mb.materials.append(mat)
        return ob

    # The dollop: a smooth oval leaning forward (-y), and a fold beside it
    q = Matrix.Rotation(math.radians(-24), 4, "Z").to_quaternion()
    metaballs("Cream dollop", [
        ((0.04, -0.06, rim + 0.08), 0.42, (1.25, 0.9, 0.5), 2.0, q),
        ((-0.1, 0.06, rim + 0.07), 0.26, (1.2, 0.9, 0.55), 2.0, q),   # the fold
    ])
    return cushion


def make_einspanner(mats, rng):
    spin = link_scene(bpy.data.objects.new("Einspanner spin", None))
    spin.location = EIN_AT
    tum = EIN_GLASS
    make_glass(tum, mats["glass"], spin, "Einspanner glass")
    make_condensation(tum, mats["water"], spin, rng, 520, COFFEE_TOP + 0.1, "Einspanner condensation")
    shadow_disc(tum, spin, "Einspanner shadow")

    make_liquid_shell(tum, COFFEE_TOP - 0.15, mats["ein"], spin, "Einspanner coffee")
    make_cream(tum, mats["cream"], spin)
    return spin


# ---------------------------------------------------------------------------
# Stage
# ---------------------------------------------------------------------------
def aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, target, energy, size, size_y=None, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    if size_y:
        data.shape = "RECTANGLE"
        data.size = size
        data.size_y = size_y
    else:
        data.size = size
    data.color = color
    obj = link_scene(bpy.data.objects.new(name, data))
    obj.location = location
    aim(obj, target)
    return obj


def make_stage(scene, args, samples):
    target, frame_h = Vector((0.0, 0.0, 0.86)), 2.15
    if args.closeup == "tea":
        target, frame_h = TEA_AT + Vector((0, 0, 0.85)), 1.85
    elif args.closeup == "ein":
        target, frame_h = EIN_AT + Vector((0, 0, 0.75)), 1.6
    elif args.closeup == "cream":
        target, frame_h = EIN_AT + Vector((0, 0, 1.3)), 0.75
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 90
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 36
    dist = (frame_h / 2) / (18 / 90)
    cam = link_scene(bpy.data.objects.new("Camera", cam_data))
    tilt = math.radians(9)   # a little from above, so the tops show
    cam.location = target + Vector((0, -dist * math.cos(tilt), dist * math.sin(tilt)))
    aim(cam, target)
    scene.camera = cam

    # A studio to reflect: dark floor, a bright band at the horizon, a bright
    # ceiling. Glass needs something to show in it.
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    wnt = world.node_tree
    bg = wnt.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.3
    N = Nodes(wnt)
    coord = N.node("ShaderNodeTexCoord")
    zdir = N.sep(coord.outputs["Generated"])[2]
    col = N.ramp(N.map(zdir, -1.0, 1.0), [(0.3, "#2A2724"), (0.47, "#7A7570"), (0.52, "#FFFFFF"),
                                          (0.58, "#8A8580"), (0.8, "#C8C4BE"), (1.0, "#FFFFFF")])
    wnt.links.new(col, bg.inputs["Color"])
    scene.world = world

    # Key: a big softbox front-left and above. Two tall strips behind the
    # glasses draw the long highlights down their edges. A top light for the
    # cream and foam, a warm low fill, and a little kick from behind.
    add_area_light("Key", (-3.0, -3.4, 3.2), (0, 0, 0.9), 520, 3.0)
    add_area_light("Strip left", (-2.4, 1.6, 1.2), (-0.4, 0, 0.8), 420, 0.4, 3.4)
    add_area_light("Strip right", (2.5, 1.2, 1.3), (0.4, 0, 0.8), 460, 0.4, 3.4)
    add_area_light("Top", (0.0, -0.6, 4.4), (0, 0, 1.0), 200, 2.6)
    add_area_light("Fill", (3.2, -3.0, 0.7), (0, 0, 0.7), 110, 4.0, color=(1.0, 0.93, 0.84))

    # Light cards behind each glass, seen only through the glass
    glow_card(TEA_AT, 0.95, 1.5, 2.6, "Tea glow", "#FFF0D6")
    glow_card(EIN_AT, 0.6, 1.05, 1.2, "Einspanner glow", "#FFF3E4")

    # The floor catches the shadows only; the page shows through everywhere else
    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Shadow catcher"
    floor.is_shadow_catcher = True

    scene.render.engine = "CYCLES"
    scene.render.film_transparent = True
    for attr, val in (("film_transparent_glass", True), ("film_transparent_roughness", 0.1)):
        if hasattr(scene.cycles, attr):
            setattr(scene.cycles, attr, val)
    aspect = 1.2
    if args.closeup:
        aspect = 0.8
    scene.render.resolution_y = args.height or 1400
    scene.render.resolution_x = args.width or int(round(scene.render.resolution_y * aspect))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    # Khronos PBR Neutral keeps the drinks' colours true (AgX greyed the
    # coffee and pinked the tea) while still rolling highlights off softly
    for vt in ("Khronos PBR Neutral", "AgX", "Standard"):
        try:
            scene.view_settings.view_transform = vt
            break
        except TypeError:
            continue
    for look in ("None",):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.view_settings.exposure = EXPOSURE

    c = scene.cycles
    c.samples = samples
    c.use_denoising = True
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.01
    c.max_bounces = 32
    c.transmission_bounces = 32
    c.transparent_max_bounces = 32
    c.glossy_bounces = 8
    c.diffuse_bounces = 4
    c.volume_bounces = 2
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 0.5

    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type != "CPU" for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type != "CPU"
                c.device = "GPU"
                print(f"[duo] rendering on {kind}")
                return
        print("[duo] no GPU found, rendering on CPU")
    except Exception as e:  # noqa: BLE001
        print(f"[duo] GPU setup skipped ({e})")


def render_to(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[duo] wrote {path}")


def main():
    args = parse_args()
    rng = random.Random(args.seed)
    samples = args.samples or (128 if not args.spin else 160)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    mats = {
        "glass": glass_material(),
        "water": water_material(),
        "ice": ice_material(),
        "tea": tea_material(),
        "tea_foam": tea_foam_material(),
        "lemon": lemon_material(),
        "ein": ein_liquid_material(),
        "cream": cream_material(),
    }
    tea = make_tea(mats, rng)
    ein = make_einspanner(mats, rng)
    make_stage(scene, args, samples)

    out = os.path.join(args.out, "duo")
    os.makedirs(out, exist_ok=True)

    if args.stats:
        import time
        t0 = time.time()
        dg = bpy.context.evaluated_depsgraph_get()
        for ob in scene.objects:
            if ob.type in ("MESH", "META"):
                ev = ob.evaluated_get(dg)
                me = ev.to_mesh()
                print(f"[duo] {ob.name:28s} verts {len(me.vertices):7d} faces {len(me.polygons):7d}")
                ev.to_mesh_clear()
        print(f"[duo] evaluated in {time.time() - t0:.1f}s")
        return

    def state(i, n):
        """Frame i of n: both glasses a full turn, the swirl round a circle."""
        f = i / n
        tea.rotation_euler = (0, 0, math.radians(360 * f) + 0.6)
        ein.rotation_euler = (0, 0, math.radians(360 * f) - 0.4)
        a = 2 * math.pi * f
        CONTROLS["drift"].default_value = (DRIFT * math.cos(a), DRIFT * math.sin(a), 0.0)

    if args.save_blend:
        state(0, 1)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "baia_duo.blend"))

    if args.preview or args.closeup:
        tag = f"closeup-{args.closeup}" if args.closeup else "preview"
        for deg in (int(d) for d in args.angles.split(",")):
            state(deg, 360)
            render_to(scene, os.path.join(out, f"{tag}_{deg:03d}.png"))

    if args.spin:
        for i in range(args.spin):
            state(i, args.spin)
            render_to(scene, os.path.join(out, "frames-spin", f"frame-{i:03d}.png"))


main()
