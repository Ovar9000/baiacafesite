"""
BAIA hero, drink layer: a classic iced Spanish latte in BAIA's faceted
tumbler, with milk pouring in from a ceramic pitcher, a splash where it lands,
condensation on the glass and coffee beans floating around.

The glass and everything in it turn a full 360 degrees (the page plays it as a
slow, endless spin). The pitcher, the pour, the splash and the beans stay
still. The BAIA letters are a separate layer (blender/baia_letters.py) that
the page places behind and above this one, so the name never turns away.

Renders on a transparent background, and with transparent glass: wherever you
see through the glass to "nothing", the page's time-of-day backdrop shows.

Run headless from the repo root:

  blender -b -P blender/baia_drink.py -- --preview               # 3 stills: 0, 120, 240 deg
  blender -b -P blender/baia_drink.py -- --preview --pour milk
  blender -b -P blender/baia_drink.py -- --intro 36 --spin 48    # the animation (see below)
  blender -b -P blender/baia_drink.py -- --save-blend            # open it in Blender

The animation comes in two parts that join seamlessly:

  intro  (frames-intro/)  plays once: the glass holds cold milk over condensed
                          milk; the espresso stream falls from the pitcher,
                          splashes, and the shot clouds down through the milk.
  spin   (frames-spin/)   loops: the glass turns 360 degrees while the
                          marbling drifts gently in a closed loop, so the last
                          frame leads back into the first.

The intro's last frame is the spin's first frame.

Units are decimetres: the glass is 12 cm tall, like a 31 cl Picardie tumbler.
Output goes to blender/out/drink-<drink>/ (gitignored). See plans/hero-3d-baia.md.
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

# ---------------------------------------------------------------------------
# Glass shape (decimetres)
# ---------------------------------------------------------------------------
GLASS_H = 1.2
R_BOTTOM = 0.31
R_TOP = 0.43
FACETS = 12            # panels around the lower part, like a Picardie tumbler
FACET_TOP = 0.78       # the panels fade into the smooth band above this height
WALL = 0.02
BASE = 0.10            # the heavy glass base
SEGMENTS = FACETS * 12

LIQUID_TOP = 1.0       # where the drink's surface sits
POUR_LAND = Vector((0.0, 0.0, LIQUID_TOP))
SPOUT = Vector((0.34, 0.0, 2.24))   # the pitcher's lip, where the pour starts:
                                    # above the letters, so the pour crosses them

# Exposure and colour management match the letters, so the cream matches
EXPOSURE = 0.2

# Animation
CONTROLS = {}          # shader inputs the frames drive (filled in by the materials)
DRIFT = 0.12           # how far the marbling wanders over one spin
LAND = 0.2             # share of the intro spent on the stream's fall
POUR_RADIUS = 0.016    # set in main() from --pour
POUR_KIND = "espresso"  # set in main()
DRINK = "cloud"         # set in make_materials()


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="baia_drink.py")
    p.add_argument("--drink", choices=["cloud", "einspanner", "spanish"], default="cloud",
                   help="cloud: cold foam poured onto dark iced coffee (the Coco Cloud); "
                        "einspanner: a cocoa-dusted cream heap on coffee over milk; "
                        "spanish: espresso into milk")
    # Espresso over milk is how a classic iced Spanish latte is built, and a
    # dark stream reads against the cream letters; milk is kept as an option
    p.add_argument("--pour", choices=["milk", "espresso", "cream"], default=None,
                   help="what the pitcher pours (default: cream for the Einspanner, espresso for the Spanish latte)")
    p.add_argument("--preview", action="store_true", help="render 3 stills")
    p.add_argument("--intro", type=int, default=0, help="render the pour intro in N frames")
    p.add_argument("--spin", type=int, default=0, help="render the looping spin in N frames")
    p.add_argument("--samples", type=int, default=None)
    p.add_argument("--width", type=int, default=None)
    p.add_argument("--height", type=int, default=None)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out", default=os.path.join(HERE, "out"))
    p.add_argument("--save-blend", action="store_true")
    p.add_argument("--closeup", choices=["pitcher", "glass", "cap"], help="frame one detail, for checking")
    a = p.parse_args(argv)
    if not (a.preview or a.intro or a.spin or a.save_blend):
        a.preview = True
    if a.pour is None:
        a.pour = "espresso" if a.drink == "spanish" else "cream"
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
    print(f"[drink] note: no input {names} on {node.name}")
    return None


def link_scene(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def mesh_object(name, verts, faces, mat=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if mat:
        me.materials.append(mat)
    return link_scene(bpy.data.objects.new(name, me), parent)


def bm_object(name, bm, mat=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if mat:
        me.materials.append(mat)
    return link_scene(bpy.data.objects.new(name, me), parent)


def lathe(name, profile, point_fn=None, segments=SEGMENTS, closed=False, mat=None, parent=None):
    """Spin a (r, z) profile around Z. A point with r == 0 becomes a single
    pole vertex. point_fn(r, z, theta, i) can reshape each vertex (facets,
    spouts). closed=True joins the last profile point back to the first."""
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

    pairs = list(zip(rings, rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            faces += [(a[0], b[j], b[(j + 1) % segments]) for j in range(segments)]
        elif len(b) == 1:
            faces += [(a[j], a[(j + 1) % segments], b[0]) for j in range(segments)]
        else:
            faces += [(a[j], a[(j + 1) % segments], b[(j + 1) % segments], b[j]) for j in range(segments)]
    return mesh_object(name, verts, faces, mat, parent)


def clear_shadow(ob):
    """Clear things (glass, ice, water) cast no shadow. With refractive
    caustics off, a shadow-casting glass would leave the drink in the dark."""
    ob.visible_shadow = False
    return ob


def uv_sphere_into(bm, matrix, radius=1.0, u=12, v=8):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=radius)
    bmesh.ops.transform(bm, matrix=matrix, verts=geom["verts"])


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
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
        "alpha": "Alpha",
    }
    for k, v in kw.items():
        set_input(bsdf, names[k], v)
    return mat, bsdf


def add_bump(mat, bsdf, scale, strength, detail=4.0):
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    set_input(tex, "Scale", scale)
    set_input(tex, "Detail", detail)
    bump = nt.nodes.new("ShaderNodeBump")
    set_input(bump, "Strength", strength)
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def make_materials(pour, drink):
    global DRINK
    DRINK = drink
    m = {}
    m["glass"], _ = principled("Glass", "#FFFFFF", roughness=0.0, ior=1.5, transmission=1.0)
    m["water"], _ = principled("Condensation", "#FFFFFF", roughness=0.0, ior=1.33, transmission=1.0)

    ice, ice_bsdf = principled("Ice", "#F4FAFF", roughness=0.06, ior=1.31, transmission=1.0)
    add_bump(ice, ice_bsdf, 18.0, 0.18)
    m["ice"] = ice

    milk, milk_bsdf = principled(
        "Milk", "#E6DED0", roughness=0.14, subsurface=0.55,
        sss_radius=(1.0, 0.8, 0.6), sss_scale=0.02, coat=0.4, coat_roughness=0.04,
    )
    m["milk"] = milk

    if pour == "espresso":
        # Dark, glossy, a little see-through at the edges where it thins
        # Opaque, not transmissive: on a transparent film a see-through
        # stream shows the page's backdrop through it. A thick espresso
        # stream is dark anyway; subsurface warms its thin edges to amber,
        # and the coat gives the wet, mirror-like highlight
        m["pour"], _ = principled("Espresso pour", "#2E1405", roughness=0.08, ior=1.34,
                                  subsurface=0.2, sss_radius=(1.0, 0.4, 0.12), sss_scale=0.012,
                                  coat=0.6, coat_roughness=0.02)
    elif pour == "cream":
        m["pour"] = cream_material("Cream pour", dust=False)
    else:
        m["pour"] = milk
    m["cream"] = cream_material("Whipped cream", dust=True)

    # A stainless steel frothing pitcher, as in a barista's hand; the
    # Spanish latte keeps its glazed stoneware creamer
    if drink == "spanish":
        ceramic, cer_bsdf = principled("Ceramic", "#B9A68C", roughness=0.4, coat=0.4, coat_roughness=0.05)
        add_bump(ceramic, cer_bsdf, 140.0, 0.03)
    else:
        ceramic, cer_bsdf = principled("Steel", "#C9CACD", roughness=0.2)
        set_input(cer_bsdf, "Metallic", 1.0)
        set_input(cer_bsdf, ["Anisotropic", "Specular Anisotropic"], 0.6)
        add_bump(ceramic, cer_bsdf, 260.0, 0.015)
    m["ceramic"] = ceramic

    m["bean"] = bean_material()
    m["latte"] = spanish_latte_material(drink)
    return m


def bean_material():
    mat, bsdf = principled("Coffee bean", "#4A2410", roughness=0.42, coat=0.25, coat_roughness=0.25)
    nt = mat.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    set_input(noise, "Scale", 9.0)
    set_input(noise, "Detail", 6.0)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = hex_to_linear("#2E1508")
    ramp.color_ramp.elements[1].color = hex_to_linear("#7A4523")
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    set_input(bump, "Strength", 0.12)
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def spanish_latte_material(drink="spanish"):
    """One liquid, layered by height like a real iced Spanish latte:
    condensed milk settled at the bottom, cold milk, then espresso clouding
    down into the milk from the top. Noise warps the boundary so the espresso
    hangs in marbled wisps. Milky parts scatter light (subsurface); espresso
    parts let light through (transmission), so the glass glows amber."""
    mat = bpy.data.materials.new("Spanish latte")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    set_input(bsdf, "Roughness", 0.06)
    set_input(bsdf, "IOR", 1.34)
    set_input(bsdf, "Subsurface Radius", (1.0, 0.7, 0.45))
    set_input(bsdf, "Subsurface Scale", 0.04)

    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])

    # Large, soft clouds plus fine wisps
    clouds = nt.nodes.new("ShaderNodeTexNoise")
    set_input(clouds, "Scale", 3.2)
    set_input(clouds, "Detail", 8.0)
    set_input(clouds, "Roughness", 0.62)
    set_input(clouds, "Distortion", 1.4)
    # Drift: an offset into the noise that the animation moves round a small
    # circle, so the marbling shifts and comes back exactly (a seamless loop)
    drift = nt.nodes.new("ShaderNodeVectorMath")
    drift.operation = "ADD"
    drift.name = "Drift"
    nt.links.new(coord.outputs["Object"], drift.inputs[0])
    CONTROLS["drift"] = drift.inputs[1]
    nt.links.new(drift.outputs["Vector"], clouds.inputs["Vector"])
    wisps = nt.nodes.new("ShaderNodeTexNoise")
    set_input(wisps, "Scale", 9.0)
    set_input(wisps, "Detail", 10.0)
    set_input(wisps, "Distortion", 4.5)
    nt.links.new(drift.outputs["Vector"], wisps.inputs["Vector"])

    # Bloom: 0 = all milk (before the shot), 1 = the espresso fully clouded down
    bloom = nt.nodes.new("ShaderNodeValue")
    bloom.name = "Bloom"
    bloom.outputs[0].default_value = 1.0
    CONTROLS["bloom"] = bloom.outputs[0]

    def math_node(op, a, b=None, clamp=False):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for idx, val in enumerate((a, b)):
            if val is None:
                continue
            if isinstance(val, (int, float)):
                n.inputs[idx].default_value = val
            else:
                nt.links.new(val, n.inputs[idx])
        return n.outputs[0]

    def map_range(val, fmin, fmax, tmin=0.0, tmax=1.0):
        n = nt.nodes.new("ShaderNodeMapRange")
        n.clamp = True
        nt.links.new(val, n.inputs["Value"])
        n.inputs["From Min"].default_value = fmin
        n.inputs["From Max"].default_value = fmax
        n.inputs["To Min"].default_value = tmin
        n.inputs["To Max"].default_value = tmax
        return n.outputs["Result"]

    # z, pushed up and down by the clouds -> how far into the espresso we are
    # The Einspanner's layers are cleaner (milk below, coffee above, as in
    # the photo); the Spanish latte's espresso hangs in marbled clouds
    ein = drink in ("einspanner", "cloud")
    cloud = drink == "cloud"
    warp = math_node("ADD",
                     math_node("MULTIPLY", math_node("SUBTRACT", clouds.outputs["Fac"], 0.5), 0.16 if ein else 0.42),
                     math_node("MULTIPLY", math_node("SUBTRACT", wisps.outputs["Fac"], 0.5), 0.05 if ein else 0.12))
    zz = math_node("ADD", sep.outputs["Z"], warp)
    # Before the bloom, push everything below the espresso band
    zz = math_node("SUBTRACT", zz, math_node("MULTIPLY", math_node("SUBTRACT", 1.0, bloom.outputs[0]), 0.75))
    if cloud:
        t = map_range(zz, 0.1, 0.75)
    elif ein:
        t = map_range(zz, 0.42, 0.66)
    else:
        t = map_range(zz, 0.48, 1.02)

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, hex_to_linear("#5C2D10" if cloud else "#F4EFE6")   # cold milk
    els[1].position, els[1].color = 1.0, hex_to_linear("#241005" if cloud else "#9C6838" if ein else "#3B1A07")   # coffee / espresso
    if cloud:
        # Dark iced coffee top to bottom; a touch of amber low down, where
        # more light gets through the base
        stops = ((0.5, "#3A1A08"),)
    elif ein:
        stops = ((0.35, "#E6D3BA"), (0.62, "#C0915F"))
    else:
        stops = ((0.28, "#E8CDA8"), (0.5, "#C68A52"), (0.74, "#7A3F16"))
    for pos, col in stops:
        e = els.new(pos)
        e.color = hex_to_linear(col)
    nt.links.new(t, ramp.inputs["Fac"])

    # Condensed milk settled in the bottom ~1 cm, with a soft edge
    condensed = map_range(math_node("ADD", sep.outputs["Z"], math_node("MULTIPLY", math_node("SUBTRACT", wisps.outputs["Fac"], 0.5), 0.03)), 0.17, 0.23, 1.0, 0.0)
    if ein:
        condensed = math_node("MULTIPLY", condensed, 0.0)   # no condensed milk in this one
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(condensed, mix.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], mix.inputs[6])     # A
    mix.inputs[7].default_value = hex_to_linear("#E9D3A6")  # B: condensed milk
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    # Espresso lets light through, milk scatters it
    if cloud:
        # Black coffee lets light through: the ice and the amber edges show
        clear = math_node("ADD", math_node("MULTIPLY", t, 0.0), 0.62)
    else:
        clear = math_node("MULTIPLY", map_range(t, 0.45, 0.95, 0.0, 0.35 if ein else 0.75), math_node("SUBTRACT", 1.0, condensed), clamp=True)
    nt.links.new(clear, bsdf.inputs["Transmission Weight"])
    nt.links.new(math_node("SUBTRACT", 1.0, clear, clamp=True), bsdf.inputs["Subsurface Weight"])
    return mat


# ---------------------------------------------------------------------------
# Glass
# ---------------------------------------------------------------------------
def r_outer(z):
    """Outer radius of the round section at height z: a gentle taper and a
    tiny flare at the lip."""
    return R_BOTTOM + (R_TOP - R_BOTTOM) * (z / GLASS_H) + 0.006 * smoothstep(1.1, GLASS_H, z)


def facet_scale(theta):
    """1 at a panel corner, cos(15 deg) mid-panel: straight-sided panels."""
    half = math.pi / FACETS
    local = (theta % (2 * half)) - half
    return math.cos(half) / math.cos(local)


def facet_blend(z):
    """How much the panels show at height z (they fade out at FACET_TOP)."""
    return 1.0 - smoothstep(FACET_TOP - 0.05, FACET_TOP + 0.05, z)


def outer_point(r, z, theta):
    s = 1.0 + facet_blend(z) * (facet_scale(theta) - 1.0)
    return (r * s * math.cos(theta), r * s * math.sin(theta), z)


def r_inner(z):
    return r_outer(z) * math.cos(math.pi / FACETS) - WALL


def make_glass(mats, parent):
    outer = [(0.0, 0.0), (R_BOTTOM - 0.03, 0.0), (R_BOTTOM - 0.008, 0.006), (r_outer(0.02), 0.02)]
    z = 0.05
    while z < GLASS_H - 0.02:
        outer.append((r_outer(z), z))
        z += 0.03
    n_outer = len(outer)
    rim = [(r_outer(GLASS_H) + 0.001, GLASS_H - 0.004), (r_outer(GLASS_H) - 0.006, GLASS_H + 0.002),
           (r_inner(GLASS_H) + 0.006, GLASS_H + 0.002), (r_inner(GLASS_H), GLASS_H - 0.004)]
    inner = []
    z = GLASS_H - 0.03
    while z > BASE + 0.03:
        inner.append((r_inner(z), z))
        z -= 0.03
    inner += [(r_inner(BASE + 0.012), BASE + 0.012), (r_inner(BASE) - 0.015, BASE), (0.0, BASE - 0.004)]
    profile = outer + rim + inner

    def point(r, zz, th, i):
        if i < n_outer:
            return outer_point(r, zz, th)
        return (r * math.cos(th), r * math.sin(th), zz)

    ob = lathe("Glass", profile, point, mat=mats["glass"], parent=parent)
    clear_shadow(ob)
    return ob


def make_liquid(mats, parent):
    gap = 0.003  # a hair inside the glass so the surfaces never touch
    z0 = BASE + 0.002
    prof = [(0.0, z0), (r_inner(BASE) - 0.018, z0), (r_inner(z0 + 0.012) - gap, z0 + 0.012)]
    z = z0 + 0.04
    while z < LIQUID_TOP - 0.01:
        prof.append((r_inner(z) - gap, z))
        z += 0.04
    prof += [(r_inner(LIQUID_TOP) - gap, LIQUID_TOP - 0.004), (r_inner(LIQUID_TOP) - gap - 0.006, LIQUID_TOP), (0.0, LIQUID_TOP)]
    return lathe("Spanish latte", prof, mat=mats["latte"], parent=parent, segments=96)


def make_ice(mats, parent, rng):
    # Cubes floating at the top, off-centre so the pour lands clear of them,
    # plus a couple lower down against the glass
    spots = [
        (0.19, 0.4, 0.985, 0.17), (0.2, 2.5, 0.975, 0.16), (0.17, 4.4, 0.99, 0.15),
        (0.2, 1.4, 0.80, 0.15), (0.19, 3.6, 0.72, 0.15), (0.12, 5.4, 0.56, 0.14),
    ]
    for k, (rad, ang, z, size) in enumerate(spots):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = (size * rng.uniform(0.9, 1.1) for _ in range(3))
        rot = (Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, "X")
               @ Matrix.Rotation(rng.uniform(0, math.pi), 4, "Z")
               @ Matrix.Rotation(rng.uniform(-0.4, 0.4), 4, "Y"))
        m = Matrix.Translation((rad * math.cos(ang), rad * math.sin(ang), z)) @ rot @ Matrix.Diagonal((sx, sy, sz, 1))
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        ob = bm_object(f"Ice {k}", bm, mats["ice"], parent, smooth=True)
        clear_shadow(ob)
        bev = ob.modifiers.new("Round", "BEVEL")
        bev.width = size * 0.18
        bev.segments = 5
        sub = ob.modifiers.new("Soft", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 2


def make_condensation(mats, parent, rng, count=420):
    """Beads of water on the cold part of the glass, a few big ones, and a
    few that have started to run."""
    bm = bmesh.new()
    for _ in range(count):
        z = rng.uniform(0.04, LIQUID_TOP - 0.02)
        th = rng.uniform(0, 2 * math.pi)
        # Mostly tiny, now and then a fat bead
        size = 0.0035 + rng.random() ** 3 * 0.014
        x, y, _z = outer_point(r_outer(z), z, th)
        # The facet's own normal where the panels show, else radial
        half = math.pi / FACETS
        facet_th = th - ((th % (2 * half)) - half)
        nth = facet_th + (th - facet_th) * (1 - facet_blend(z))
        normal = Vector((math.cos(nth), math.sin(nth), 0.0))
        pos = Vector((x, y, z)) + normal * size * 0.35
        streak = rng.random() < 0.06
        stretch = rng.uniform(2.5, 5.0) if streak else rng.uniform(1.0, 1.25)
        rot = normal.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m = Matrix.Translation(pos) @ rot @ Matrix.Diagonal((size, size * stretch, size * 0.42, 1))
        if streak:
            m = Matrix.Translation((0, 0, -size * stretch * 0.6)) @ m
        uv_sphere_into(bm, m, 1.0, 10, 6)
    return clear_shadow(bm_object("Condensation", bm, mats["water"], parent))


# ---------------------------------------------------------------------------
# Einspanner: the whipped-cream cap
# ---------------------------------------------------------------------------
def cream_material(name, dust):
    """Whipped cream: soft, milky, lumpy. With dust, cocoa settles on the
    upward-facing parts in patchy specks (as it falls from a sieve), and
    the cream is stained tan where it sits in the coffee."""
    # A shade under white: the key and top lights are strong, and pure
    # white clips to a flat shape with no lumps (and no cocoa)
    mat, bsdf = principled(name, "#CFC5B4", roughness=0.5, subsurface=0.35,
                           sss_radius=(1.0, 0.85, 0.7), sss_scale=0.02, coat=0.08, coat_roughness=0.25)
    nt = mat.node_tree

    def noise(scale, detail=2.0, roughness=0.5, vec=None):
        n = nt.nodes.new("ShaderNodeTexNoise")
        set_input(n, "Scale", scale)
        set_input(n, "Detail", detail)
        set_input(n, "Roughness", roughness)
        if vec is not None:
            nt.links.new(vec, n.inputs["Vector"])
        return n.outputs["Fac"]

    def map_range(val, fmin, fmax, tmin=0.0, tmax=1.0):
        n = nt.nodes.new("ShaderNodeMapRange")
        n.clamp = True
        nt.links.new(val, n.inputs["Value"])
        n.inputs["From Min"].default_value = fmin
        n.inputs["From Max"].default_value = fmax
        n.inputs["To Min"].default_value = tmin
        n.inputs["To Max"].default_value = tmax
        return n.outputs["Result"]

    def mul(a, b):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = "MULTIPLY"
        n.use_clamp = True
        for idx, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[idx].default_value = v
            else:
                nt.links.new(v, n.inputs[idx])
        return n.outputs[0]

    def mix(fac, a, b):
        m = nt.nodes.new("ShaderNodeMix")
        m.data_type = "RGBA"
        nt.links.new(fac, m.inputs["Factor"])
        for idx, v in ((6, a), (7, b)):
            if isinstance(v, str):
                m.inputs[idx].default_value = hex_to_linear(v)
            else:
                nt.links.new(v, m.inputs[idx])
        return m.outputs[2]

    coord = nt.nodes.new("ShaderNodeTexCoord")
    geo = nt.nodes.new("ShaderNodeNewGeometry")

    # Lumpy, piped texture: big soft lumps plus a fine grain
    bump = nt.nodes.new("ShaderNodeBump")
    set_input(bump, "Strength", 0.45)
    lumps = nt.nodes.new("ShaderNodeMath")
    lumps.operation = "ADD"
    nt.links.new(noise(9.0, 3.0, 0.55, coord.outputs["Object"]), lumps.inputs[0])
    nt.links.new(mul(noise(140.0, 2.0, 0.5, coord.outputs["Object"]), 0.25), lumps.inputs[1])
    nt.links.new(lumps.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    color = None
    if dust:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
        # Tan where the cream sits in the coffee (the cap's lowest ~10 cm)
        stain = map_range(sep.outputs["Z"], 0.16, 0.04)
        stain = mul(stain, map_range(noise(6.0, 2.0, 0.5, coord.outputs["Object"]), 0.3, 0.6))
        base = mix(stain, "#CFC5B4", "#B8925F")
        # Cocoa: fine specks, in patches, only on what faces up
        nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], nsep.inputs["Vector"])
        up = map_range(nsep.outputs["Z"], -0.1, 0.7)
        patch = map_range(noise(4.0, 2.0, 0.5, coord.outputs["Object"]), 0.3, 0.6)
        specks = map_range(noise(200.0, 1.0, 0.5, coord.outputs["Object"]), 0.47, 0.56)
        haze = mul(map_range(noise(36.0, 2.0, 0.5, coord.outputs["Object"]), 0.38, 0.6), 0.7)
        amount = nt.nodes.new("ShaderNodeValue")
        amount.name = "Dust"
        amount.outputs[0].default_value = 1.0
        CONTROLS["dust"] = amount.outputs[0]
        cover = nt.nodes.new("ShaderNodeMath")
        cover.operation = "MAXIMUM"
        nt.links.new(specks, cover.inputs[0])
        nt.links.new(haze, cover.inputs[1])
        dusting = mul(mul(mul(cover.outputs[0], patch), up), amount.outputs[0])
        color = mix(dusting, base, "#8A4526")
        # Cocoa is dry and matte
        rough = nt.nodes.new("ShaderNodeMapRange")
        rough.clamp = True
        nt.links.new(dusting, rough.inputs["Value"])
        rough.inputs["To Min"].default_value = 0.45
        rough.inputs["To Max"].default_value = 0.9
        nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    if color is not None:
        nt.links.new(color, bsdf.inputs["Base Color"])
    return mat


def make_cream_cap(mats, parent, style="einspanner"):
    """A heap of whipped cream: it fills the glass from the coffee up to the
    rim, mounds above it with a big dollop leaning towards the camera, and
    slumps over the rim in a few places. Metaballs give the soft, merged
    blobs of cream. The origin sits on the coffee, so scaling it up grows the
    heap from where the cream lands."""
    mb = bpy.data.metaballs.new("Cream")
    mb.resolution = 0.03
    mb.render_resolution = 0.012
    mb.threshold = 0.6

    def ball(co, r, size=None, stiff=1.5):
        el = mb.elements.new()
        el.co = co
        el.radius = r
        # Softer than default, so the blobs melt into one heap
        el.stiffness = stiff
        if size:
            el.type = "ELLIPSOID"
            el.size_x, el.size_y, el.size_z = size

    # Inside the glass, coffee to rim (the glass is ~0.37-0.40 wide here)
    ball((0.0, 0.0, 0.12), 0.42)
    for k in range(8):
        a = 2 * math.pi * k / 8
        ball((0.23 * math.cos(a), 0.23 * math.sin(a), 0.16), 0.24)
    if style == "cloud":
        # Cold foam: a soft, low cloud that rises a little over the rim and
        # rolls onto it, as in the Coco Cloud photo
        ball((0.0, -0.02, 0.24), 0.62, (1.0, 1.0, 0.36))
        ball((0.09, -0.12, 0.31), 0.22)
        ball((-0.13, 0.08, 0.29), 0.2)
        for a, r in ((0.4, 0.2), (1.6, 0.19), (2.8, 0.2), (4.0, 0.19), (5.2, 0.21)):
            ball((0.34 * math.cos(a), 0.34 * math.sin(a), 0.25), r)
        for a, drop in ((5.0, 0.08), (2.2, 0.05)):
            ball((0.44 * math.cos(a), 0.44 * math.sin(a), 0.22 - drop * 0.6), 0.09, (0.62, 0.62, 1.0 + drop * 5), stiff=2.0)
        ob = bpy.data.objects.new("Cream cap", mb)
        link_scene(ob, parent)
        ob.location = (0.0, 0.0, LIQUID_TOP - 0.02)
        mb.materials.append(mats["cream"])
        return ob
    # The heap: a broad dome over the rim, a big dollop leaning towards the
    # camera (at -y), and a soft peak that curls over
    ball((0.0, -0.02, 0.34), 0.62, (1.0, 1.0, 0.62))
    ball((0.05, -0.1, 0.5), 0.36)
    ball((-0.14, 0.06, 0.44), 0.26)
    ball((0.1, -0.13, 0.66), 0.16, stiff=1.8)
    # Slumping onto the rim, and tongues of cream over it
    for a, r in ((0.5, 0.22), (1.7, 0.2), (2.9, 0.21), (4.0, 0.2), (5.2, 0.23)):
        ball((0.34 * math.cos(a), 0.34 * math.sin(a), 0.3), r)
    for a, drop in ((5.0, 0.14), (1.2, 0.1), (3.3, 0.07)):
        ball((0.44 * math.cos(a), 0.44 * math.sin(a), 0.24 - drop * 0.6), 0.11, (0.62, 0.62, 1.0 + drop * 5), stiff=2.0)

    ob = bpy.data.objects.new("Cream cap", mb)
    link_scene(ob, parent)
    ob.location = (0.0, 0.0, LIQUID_TOP - 0.02)
    mb.materials.append(mats["cream"])
    return ob


# ---------------------------------------------------------------------------
# The BAIA letters, exploded around the glass
# ---------------------------------------------------------------------------
# Each letter on its own: (char, home position, home tilt in degrees (x, y, z),
# size, phase offset). Scattered like a magazine collage, at different
# depths (y < 0 is nearer the camera) so some sit in front of others, and
# read B-A-I-A left to right.
BURST = [
    ("B", (-0.74, -0.30, 2.36), (10, -16, 12), 1.0, 0.00),
    ("A", (-0.10, 0.40, 2.80), (-8, 14, -9), 0.9, 0.27),
    ("I", (0.52, 0.12, 2.46), (12, 22, 7), 0.95, 0.51),
    ("A", (1.0, -0.40, 1.98), (-10, -26, -15), 1.02, 0.76),
]
BURST_FROM = Vector((0.0, -0.05, 1.45))   # out of the cream


def letter_material():
    """The same glossy cream as the old wordmark render."""
    mat, _ = principled("Letter cream", "#E6D8C2", roughness=0.32, subsurface=0.35,
                        sss_radius=(1.0, 0.55, 0.3), sss_scale=0.06, coat=0.7, coat_roughness=0.06)
    return mat


def make_burst_letters():
    font = bpy.data.fonts.load(os.path.join(HERE, "fonts", "DynaPuff-Bold.ttf"), check_existing=True)
    mat = letter_material()
    letters = []
    for k, (ch, home, tilt, size, off) in enumerate(BURST):
        cu = bpy.data.curves.new(f"Letter {k}", type="FONT")
        cu.body = ch
        cu.font = font
        cu.size = size
        cu.align_x = "CENTER"
        cu.align_y = "CENTER"
        # Chunky: deep, with rounded edges that keep the counters open
        # Deep blocks, like poster type flung around a product shot
        cu.extrude = 0.13 * size
        cu.bevel_depth = 0.035 * size
        cu.offset = -cu.bevel_depth
        cu.bevel_resolution = 6
        cu.resolution_u = 20
        ob = bpy.data.objects.new(f"Letter {ch}{k}", cu)
        link_scene(ob)
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.view_layer.objects.active
        for poly in ob.data.polygons:
            poly.use_smooth = True
        wn = ob.modifiers.new("Weighted Normal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        ob.data.materials.append(mat)
        ob.rotation_euler = (math.radians(90), 0, 0)   # stand it up, facing the camera
        holder = link_scene(bpy.data.objects.new(f"Letter holder {k}", None))
        ob.parent = holder
        letters.append((holder, Vector(home), [math.radians(a) for a in tilt], off))
    return letters


def ease_out_back(x, s=1.5):
    x = min(1.0, max(0.0, x)) - 1.0
    return 1.0 + x * x * ((s + 1) * x + s)


def pose_letters(letters, phase, burst=1.0):
    """phase: the loop, 0..1 (they bob and sway with the glass's turn, and
    come back exactly). burst: 0 = still inside the cream, 1 = home. Each
    letter leaves a moment after the one before."""
    for k, (holder, home, tilt, off) in enumerate(letters):
        a = 2 * math.pi * (phase + off)
        bob = Vector((0.0, 0.0, 0.05 * math.sin(a)))
        rx = tilt[0] + math.radians(6) * math.cos(a)
        rz = tilt[2] + math.radians(14) * math.sin(a)
        b = min(1.0, max(0.0, (burst - k * 0.08) / 0.68))
        if b <= 0.0:
            holder.hide_render = True
            for c in holder.children:
                c.hide_render = True
            continue
        holder.hide_render = False
        for c in holder.children:
            c.hide_render = False
        travel = ease_out_back(b)
        holder.location = BURST_FROM.lerp(home + bob, travel)
        # They tumble out: a turn and a bit that unwinds as they land
        unwind = (1.0 - (1.0 - (1.0 - b) ** 2)) * math.radians(320) * (1 if k % 2 else -1)
        holder.rotation_euler = (rx, tilt[1], rz + unwind)
        sc = 0.2 + 0.8 * (1.0 - (1.0 - b) ** 3)
        holder.scale = (sc, sc, sc)


# ---------------------------------------------------------------------------
# Pitcher and pour (they don't spin)
# ---------------------------------------------------------------------------
PITCHER_TILT = math.radians(70)
PITCHER_YAW = math.radians(-28)


def pitcher_matrix(spout_local, tilt=PITCHER_TILT, lift=Vector((0.0, 0.0, 0.0))):
    rot = (Matrix.Rotation(PITCHER_YAW, 4, "Z") @ Matrix.Rotation(-tilt, 4, "Y")
           @ Matrix.Rotation(math.pi, 4, "Z"))
    offset = rot @ spout_local
    return Matrix.Translation(SPOUT + lift - offset.to_3d()) @ rot


def make_pitcher(mats):
    outer = [(0.0, 0.0), (0.2, 0.0), (0.228, 0.012), (0.244, 0.06), (0.25, 0.13),
             (0.245, 0.21), (0.232, 0.29), (0.214, 0.35), (0.212, 0.39), (0.222, 0.43), (0.232, 0.455)]
    lip = [(0.232, 0.462), (0.224, 0.466), (0.212, 0.46)]
    inner = [(0.202, 0.43), (0.194, 0.39), (0.196, 0.35), (0.214, 0.29), (0.226, 0.21),
             (0.23, 0.13), (0.224, 0.06), (0.2, 0.03), (0.0, 0.026)]
    profile = outer + lip + inner

    def spout(r, z, th, i):
        # Pull the rim out and up into a pouring lip at theta = 0
        a = (th + math.pi) % (2 * math.pi) - math.pi
        k = math.exp(-(a / 0.36) ** 2) * smoothstep(0.33, 0.45, z)
        r2 = r + 0.1 * k
        z2 = z + 0.025 * k
        return (r2 * math.cos(th), r2 * math.sin(th), z2)

    body = lathe("Pitcher", profile, spout, segments=96, mat=mats["ceramic"])
    spout_local = Vector((0.232 + 0.1 + 0.004, 0.0, 0.466 + 0.025, 1.0))
    body.matrix_world = pitcher_matrix(spout_local)

    # Handle on the far side: an ear that leaves the body just under the rim
    # and rejoins it low on the belly. Both ends start *inside* the wall, so
    # it reads as one piece of pottery rather than a loop resting on it.
    cu = bpy.data.curves.new("Pitcher handle", "CURVE")
    cu.dimensions = "3D"
    # A creamer's ear, not a mug's loop: it stands out only a finger's width
    # from the wall, from just under the rim down to the belly, and swells
    # where it joins, like pulled clay
    cu.bevel_depth = 0.016
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    pts = [(-0.19, 0, 0.40), (-0.25, 0, 0.418), (-0.315, 0, 0.405), (-0.343, 0, 0.355),
           (-0.338, 0, 0.29), (-0.312, 0, 0.228), (-0.272, 0, 0.18), (-0.225, 0, 0.152)]
    swell = [1.6, 1.25, 1.0, 1.0, 1.0, 1.0, 1.2, 1.55]
    sp.points.add(len(pts) - 1)
    for p, co, r in zip(sp.points, pts, swell):
        p.co = (*co, 1.0)
        p.radius = r
    sp.use_endpoint_u = True
    sp.order_u = 4
    cu.materials.append(mats["ceramic"])
    handle = link_scene(bpy.data.objects.new("Pitcher handle", cu))
    # Ride with the body; a strap, broad where the fingers rest and thin in
    # profile
    handle.parent = body
    handle.scale = (1.0, 1.7, 1.0)

    # Which way the lip points, in the world: the pour leaves along it
    rot = body.matrix_world.to_3x3()
    direction = (rot @ Vector((1.0, 0.0, -0.25))).normalized()

    def move(out=0.0):
        """0 = pouring; 1 = tipped back and lifted out of the frame"""
        e = smoothstep(0.0, 1.0, out)
        body.matrix_world = pitcher_matrix(spout_local, PITCHER_TILT - math.radians(55) * e,
                                           Vector((0.55, 0.0, 1.7)) * e ** 1.4)
        body.hide_render = handle.hide_render = out >= 0.999
    return direction, move


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return p0 * u ** 3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t ** 3


def make_pour(mats, direction):
    """The stream, built as a mesh so it can behave like a real pour:

    - it leaves the lip as a broad, flat sheet the width of the spout, and
      rounds into a rope within the first few centimetres
    - it necks thinner as it falls and speeds up (the flow is constant, so
      the cross-section shrinks as the speed grows: r ~ v^-1/2)
    - its surface ripples, and the ripples grow on the way down and travel
      with the flow (the loop moves them by whole wavelengths, so it is
      seamless)
    - while it is still falling, the front is a rounded, bulging head, not a
      cut-off tube

    Returns a Pour object whose .rebuild(stream, phase) redraws it."""
    p0 = SPOUT - direction * 0.015          # starts just inside the lip
    p1 = SPOUT + direction * 0.26           # a fuller arc off the spout
    p2 = POUR_LAND + Vector((0.0, 0.0, 0.62))   # gravity: it ends up falling straight
    p3 = POUR_LAND + Vector((0.0, 0.0, -0.03))
    # Sample the path evenly by length, so ripples keep one wavelength
    raw = [bezier(p0, p1, p2, p3, k / 600) for k in range(601)]
    acc = [0.0]
    for a, b in zip(raw, raw[1:]):
        acc.append(acc[-1] + (b - a).length)
    total = acc[-1]
    rings = 150
    path, j = [], 0
    for k in range(rings + 1):
        want = total * k / rings
        while j < 599 and acc[j + 1] < want:
            j += 1
        f = (want - acc[j]) / max(1e-9, acc[j + 1] - acc[j])
        path.append(raw[j].lerp(raw[j + 1], min(1.0, f)))

    me = bpy.data.meshes.new("Pour")
    ob = link_scene(bpy.data.objects.new("Pour", me))
    me.materials.append(mats["pour"])
    ring_n = 40
    wavelength = 0.16                       # of the ripples, in scene units
    # Cream is thick and slow: it barely necks, and its surface stays smooth
    cream = POUR_KIND == "cream"
    head_h = 2.0 if cream else 0.6          # how fast the head falls in (v0^2 / 2g)
    ripple = 0.35 if cream else 1.0

    def radius_at(z):
        drop = max(0.0, SPOUT.z - z)
        return POUR_RADIUS * (1 + drop / head_h) ** -0.25

    def frame_at(i):
        a = path[max(0, i - 1)]
        b = path[min(rings, i + 1)]
        t = (b - a).normalized()
        side = t.cross(Vector((0.0, 0.0, 1.0)))
        if side.length < 1e-4:
            side = Vector((0.0, 1.0, 0.0))
        side.normalize()
        return t, side, side.cross(t).normalized()

    def rebuild(stream=1.0, phase=0.0, start=0.0):
        """stream: how far down the front has reached; start: how far the
        tail has fallen from the lip once the pour stops"""
        bm = bmesh.new()
        last = max(2, int(round(rings * stream)))
        first = min(last - 2, int(round(rings * start)))
        made = []
        for i in range(first, last + 1):
            u = i / rings
            c = path[i]
            t, side, nrm = frame_at(i)
            r = radius_at(c.z)
            along = acc_len = total * u
            # Sheet at the lip -> rope: wide across, thin through
            sheet = 1 - smoothstep(0.0, 0.1, u)
            wide = 1 + 0.7 * sheet
            thin = 1 - 0.5 * sheet
            # Ripples: a bulging (varicose) wave travelling down, growing
            grow = ripple * (0.008 + 0.055 * smoothstep(0.15, 1.0, u) ** 1.5)
            wave = 2 * math.pi * (along / wavelength - phase * 6)
            bulge = 1 + grow * math.sin(wave) + 0.35 * grow * math.sin(2.3 * wave + 1.7)
            # A gentle twist, so the highlight wanders along the rope
            twist = 2.2 * u + 2 * math.pi * phase
            # Flare into the splash
            flare = 1 + 0.5 * smoothstep(0.93, 1.0, u)
            # The falling head swells a little, like a drop's leading edge
            head = 1.0
            if stream < 1.0:
                head += 0.22 * smoothstep(last - 10, last, i)
            row = []
            for k in range(ring_n):
                th = 2 * math.pi * k / ring_n
                # Not perfectly round: a slow three-lobed wobble
                wob = 1 + 0.035 * math.sin(3 * th + twist) * smoothstep(0.1, 0.4, u)
                rr = r * bulge * flare * head * wob
                off = side * (math.cos(th) * rr * wide) + nrm * (math.sin(th) * rr * thin)
                row.append(bm.verts.new(c + off))
            made.append(row)
        for a, b in zip(made, made[1:]):
            for k in range(ring_n):
                bm.faces.new((a[k], a[(k + 1) % ring_n], b[(k + 1) % ring_n], b[k]))
        # Close both ends: the top hides in the spout; the bottom is a round
        # cap (the head while it falls, under the surface once it lands)
        for row, flip in ((made[0], True), (made[-1], False)):
            t, _, _ = frame_at(first if flip else last)
            centre = sum((v.co for v in row), Vector()) / len(row)
            rr = sum(((v.co - centre).length for v in row)) / len(row)
            prev = row
            for step in range(1, 6):
                a = step / 6 * math.pi / 2
                ring2 = [bm.verts.new(centre + (v.co - centre) * math.cos(a) + t * (rr * math.sin(a) * (-1 if flip else 1)))
                         for v in row]
                for k in range(ring_n):
                    q = (prev[k], prev[(k + 1) % ring_n], ring2[(k + 1) % ring_n], ring2[k])
                    bm.faces.new(q[::-1] if flip else q)
                prev = ring2
            tip = bm.verts.new(centre + t * (rr * (-1 if flip else 1)))
            for k in range(ring_n):
                tri = (prev[k], prev[(k + 1) % ring_n], tip)
                bm.faces.new(tri[::-1] if flip else tri)
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        me.update()

    return ob, rebuild


def make_pour_drops(mats, rng):
    """A few beads shaken loose from the stream: the bigger the pour, the
    more of these a real one throws."""
    bm = bmesh.new()
    for _ in range(6):
        u = rng.uniform(0.35, 0.92)
        z = SPOUT.z + (POUR_LAND.z - SPOUT.z) * u
        x = SPOUT.x * (1 - u) ** 1.6 + rng.uniform(0.06, 0.14) * rng.choice((-1, 1))
        y = rng.uniform(-0.08, 0.05)
        size = rng.uniform(0.006, 0.012)
        uv_sphere_into(bm, Matrix.Translation((x, y, z)) @ Matrix.Diagonal((size, size, size * 1.3, 1)), 1.0, 12, 8)
    return bm_object("Pour drops", bm, mats["pour"])


def make_splash(mats, rng):
    """Where the pour lands: a raised ring of milk spreading on the surface,
    a little crown of droplets thrown up, and a few strays in the air."""
    ring_prof = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        ring_prof.append((0.1 + 0.032 * math.cos(a), LIQUID_TOP + 0.006 + 0.016 * math.sin(a)))
    ring = lathe("Splash ring", ring_prof, segments=64, closed=True, mat=mats["pour"])

    bm = bmesh.new()
    # The bloom: a flat milky disc under the ring, spreading into the drink
    disc = bmesh.ops.create_circle(bm, cap_ends=True, radius=0.14, segments=48)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, LIQUID_TOP + 0.002)), verts=disc["verts"])
    for k in range(20):
        a = 2 * math.pi * k / 20 + rng.uniform(-0.12, 0.12)
        rr = 0.13 + rng.uniform(-0.012, 0.018)
        h = LIQUID_TOP + rng.uniform(0.04, 0.11)
        size = rng.uniform(0.008, 0.015)
        up = rng.uniform(1.5, 2.6)
        uv_sphere_into(bm, Matrix.Translation((rr * math.cos(a), rr * math.sin(a), h)) @ Matrix.Diagonal((size, size, size * up, 1)), 1.0, 12, 8)
    for _ in range(11):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.18, 0.38)
        h = LIQUID_TOP + rng.uniform(0.08, 0.3)
        size = rng.uniform(0.006, 0.013)
        uv_sphere_into(bm, Matrix.Translation((rr * math.cos(a), rr * math.sin(a), h)) @ Matrix.Diagonal((size, size, size * 1.15, 1)), 1.0, 12, 8)
    drops = bm_object("Splash", bm, mats["pour"])
    # Pivot both on the landing point, so the intro can grow them from there
    for ob in (ring, drops):
        ob.data.transform(Matrix.Translation(-POUR_LAND))
        ob.location = POUR_LAND
    return [ring, drops]


# ---------------------------------------------------------------------------
# Beans and stray milk drops (still)
# ---------------------------------------------------------------------------
def bean_mesh():
    """A roasted bean: an oval with the S-shaped crease down its flat side."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        if z > 0:
            d = x - 0.14 * math.sin(y * 2.4)
            groove = 0.9 * math.exp(-(d / 0.075) ** 2) * max(0.0, 1 - y * y) ** 0.35
            v.co.z = z * (1 - groove) * 0.55   # the flat face, split by the crease
        else:
            v.co.z = z * 0.95
    bmesh.ops.scale(bm, vec=(0.072, 0.105, 0.055), verts=bm.verts)
    me = bpy.data.meshes.new("Bean")
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me


def make_beans(mats, rng):
    me = bean_mesh()
    me.materials.append(mats["bean"])
    # (x, y, z, scale): around the glass and up by the pitcher, some nearer
    # the camera, and none in the band where the letters sit (z 1.35-2.05)
    spots = [(-1.08, 0.3, 1.78, 1.0), (-0.62, -0.45, 0.62, 1.15), (0.74, -0.25, 0.92, 1.05),
             (0.64, 0.35, 0.3, 0.95), (-0.8, 0.05, 0.16, 0.9), (-0.58, -0.9, 1.12, 1.3),
             (0.66, -0.6, 0.42, 1.05), (0.86, 0.1, 1.24, 0.85), (1.18, 0.35, 2.85, 0.8)]
    for k, (x, y, z, s) in enumerate(spots):
        ob = link_scene(bpy.data.objects.new(f"Bean {k}", me))
        ob.location = (x, y, z)
        ob.rotation_euler = (rng.uniform(0, math.tau), rng.uniform(0, math.tau), rng.uniform(0, math.tau))
        ob.scale = (s, s, s)
        sub = ob.modifiers.new("Soft", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 2

    bm = bmesh.new()
    for (x, y, z, s) in [(-0.45, -0.2, 1.22, 0.016), (0.55, -0.1, 1.28, 0.012), (-0.6, 0.3, 1.0, 0.014), (0.6, -0.35, 1.1, 0.01)]:
        uv_sphere_into(bm, Matrix.Translation((x, y, z)) @ Matrix.Diagonal((s, s, s * 1.2, 1)), 1.0, 16, 10)
    bm_object("Milk drops", bm, mats["milk"])


# ---------------------------------------------------------------------------
# Stage
# ---------------------------------------------------------------------------
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


def aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_stage(scene, args, samples):
    # Frame: the glass low and centre, the pitcher cropped at the top right
    # Frame z from about -0.1 to 2.9. The page puts the BAIA letters in the
    # band between the pitcher and the rim (about 28-52% down the frame).
    target = Vector((0.1, 0.0, 1.62))
    frame_h = 3.5        # room above the glass for the exploded letters
    if args.closeup == "pitcher":
        target, frame_h = SPOUT + Vector((0.3, 0.0, 0.16)), 1.0
    elif args.closeup == "cap":
        target, frame_h = Vector((0.0, 0.0, 1.25)), 0.9
    elif args.closeup == "glass":
        target, frame_h = Vector((0.0, 0.0, 0.6)), 1.4
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 85
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 36
    dist = (frame_h / 2) / math.tan(math.atan(18 / 85))
    cam = link_scene(bpy.data.objects.new("Camera", cam_data))
    tilt = math.radians(8)   # a little from above, so the drink's surface shows
    cam.location = target + Vector((0, -dist * math.cos(tilt), dist * math.sin(tilt)))
    aim(cam, target)
    scene.camera = cam

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    wnt = world.node_tree
    bg = wnt.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.22
    # Not one flat grey: a bright ceiling, a light band at the horizon and a
    # darker floor, like a studio. Metal and glass need something to reflect.
    coord = wnt.nodes.new("ShaderNodeTexCoord")
    sep = wnt.nodes.new("ShaderNodeSeparateXYZ")
    wnt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    ramp = wnt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.3, (0.18, 0.17, 0.16, 1)
    els[1].position, els[1].color = 1.0, (1.5, 1.48, 1.45, 1)
    for pos, v in ((0.47, 0.5), (0.52, 1.6), (0.58, 0.55), (0.8, 0.8)):
        e = els.new(pos)
        e.color = (v, v * 0.98, v * 0.95, 1)
    remap = wnt.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0
    wnt.links.new(sep.outputs["Z"], remap.inputs["Value"])
    wnt.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    wnt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    scene.world = world

    # Soft key front-left, two tall strips behind for the glass edges, a
    # softbox above for the ice and the splash, and a low warm fill
    add_area_light("Key", (-2.4, -3.6, 2.6), (0, 0, 1.0), 260, 2.6)
    add_area_light("Strip left", (-2.0, 1.8, 1.3), (0, 0, 0.9), 240, 0.35, 3.2)
    add_area_light("Strip right", (2.1, 1.6, 1.4), (0, 0, 0.9), 280, 0.35, 3.2)
    add_area_light("Top", (0.2, -0.4, 4.2), (0, 0, 1.0), 110, 2.0)
    add_area_light("Fill", (2.8, -2.6, 0.6), (0, 0, 0.8), 55, 3.5, color=(1.0, 0.93, 0.85))

    scene.render.engine = "CYCLES"
    scene.render.film_transparent = True
    for attr, val in (("film_transparent_glass", True), ("film_transparent_roughness", 0.1)):
        if hasattr(scene.cycles, attr):
            setattr(scene.cycles, attr, val)
    scene.render.resolution_x = args.width or 1200
    scene.render.resolution_y = args.height or 1500
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = EXPOSURE

    c = scene.cycles
    c.samples = samples
    c.use_denoising = True
    c.use_adaptive_sampling = True
    c.max_bounces = 24
    c.transmission_bounces = 24
    c.transparent_max_bounces = 24
    c.glossy_bounces = 8
    c.diffuse_bounces = 4
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 1.0

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
                    d.use = True
                c.device = "GPU"
                print(f"[drink] rendering on {kind}")
                return
        print("[drink] no GPU found, rendering on CPU")
    except Exception as e:  # noqa: BLE001
        print(f"[drink] GPU setup skipped ({e})")


def render_to(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[drink] wrote {path}")


def main():
    args = parse_args()
    rng = random.Random(args.seed)
    global POUR_RADIUS, POUR_KIND, LIQUID_TOP, POUR_LAND
    POUR_KIND = args.pour
    # A full, generous pour: about 2.5x the old thread at the lip; cream is
    # thicker still
    POUR_RADIUS = {"espresso": 0.05, "milk": 0.054, "cream": 0.062}[args.pour]
    ein = args.drink in ("einspanner", "cloud")
    samples = args.samples or (96 if args.preview and not (args.intro or args.spin) else 192)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    mats = make_materials(args.pour, args.drink)

    # Everything that spins hangs off this
    spin = link_scene(bpy.data.objects.new("Spin", None))
    make_glass(mats, spin)
    make_liquid(mats, spin)
    make_ice(mats, spin, rng)
    make_condensation(mats, spin, rng)
    cap = make_cream_cap(mats, spin, args.drink) if ein else None
    letters = make_burst_letters() if ein else []

    direction, move_pitcher = make_pitcher(mats)
    pour, rebuild_pour = make_pour(mats, direction)
    pour_drops = make_pour_drops(mats, rng)
    rebuild_pour()
    splash = make_splash(mats, rng)
    make_beans(mats, rng)

    make_stage(scene, args, samples)

    default_pour = {"cloud": "cream", "einspanner": "cream", "spanish": "espresso"}[args.drink]
    out = os.path.join(args.out, f"drink-{args.drink}" + ("" if args.pour == default_pour else f"-{args.pour}"))

    def state(spin_deg=0.0, phase=0.0, bloom=1.0, stream=1.0, splash_k=1.0,
              start=0.0, cap_k=1.0, dust=1.0, pitcher_out=0.0, burst=1.0):
        spin.rotation_euler = (0, 0, math.radians(spin_deg))
        a = 2 * math.pi * phase
        CONTROLS["drift"].default_value = (DRIFT * math.cos(a), DRIFT * math.sin(a), 0.0)
        CONTROLS["bloom"].default_value = bloom
        gone = start >= 0.98 or stream <= 0.0
        pour.hide_render = gone
        if not gone:
            rebuild_pour(stream=max(0.02, stream), phase=phase, start=start)
        pour_drops.hide_render = ein or stream < 0.999
        for ob in splash:
            # Cream doesn't splash, it piles up
            ob.hide_render = ein or splash_k < 0.02
            ob.scale = (splash_k, splash_k, splash_k)
        if cap is not None:
            k = max(0.06, cap_k)
            cap.scale = (k, k, k)
            # Cocoa only on the Einspanner; the cloud is plain foam
            CONTROLS["dust"].default_value = dust if args.drink == "einspanner" else 0.0
        move_pitcher(pitcher_out)
        if letters:
            pose_letters(letters, phase, burst)

    def intro_state(t):
        """The pour intro, t from 0 to 1. Its last frame is the spin's first."""
        if ein:
            # The cream falls, piles into the cap, the stream breaks from the
            # lip and its tail drops in; the pitcher tips back and lifts away;
            # cocoa settles on top
            state(
                stream=min(1.0, t / 0.12) ** 1.6,
                cap_k=0.08 + 0.92 * smoothstep(0.1, 0.74, t) ** 0.85,
                start=smoothstep(0.64, 0.8, t),
                pitcher_out=smoothstep(0.7, 1.0, t),
                dust=smoothstep(0.84, 1.0, t),
                # As the cap sets, B-A-I-A burst out of it, one after another
                burst=max(0.0, (t - 0.64) / 0.36),
            )
        else:
            # The stream falls (accelerating); then the splash pops and the
            # shot clouds down through the milk, easing to rest
            after = max(0.0, (t - LAND) / (1 - LAND))
            state(
                stream=min(1.0, t / LAND) ** 1.6,
                splash_k=smoothstep(LAND, LAND + 0.12, t),
                bloom=1 - (1 - after) ** 2.4,
            )

    def spin_state(i, n):
        if ein:
            state(spin_deg=360 * i / n, phase=i / n, stream=0.0, pitcher_out=1.0)
        else:
            state(spin_deg=360 * i / n, phase=i / n)
    os.makedirs(out, exist_ok=True)

    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "baia_drink.blend"))

    if args.preview:
        # Mid-pour, then the finished drink from three sides
        intro_state(0.45)
        render_to(scene, os.path.join(out, "preview_pour.png"))
        intro_state(0.84)
        render_to(scene, os.path.join(out, "preview_burst.png"))
        for deg in (0, 120, 240):
            spin_state(deg, 360)
            render_to(scene, os.path.join(out, f"preview_{deg:03d}.png"))

    if args.intro:
        # 0 -> LAND: the stream falls (accelerating); then the splash pops
        # and the shot clouds down through the milk, easing to rest
        for i in range(args.intro):
            intro_state(i / (args.intro - 1))
            render_to(scene, os.path.join(out, "frames-intro", f"frame-{i:03d}.png"))

    if args.spin:
        for i in range(args.spin):
            spin_state(i, args.spin)
            render_to(scene, os.path.join(out, "frames-spin", f"frame-{i:03d}.png"))


main()
