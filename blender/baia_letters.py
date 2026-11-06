"""
BAIA hero: the wordmark as thick, creamy 3D letters.

Builds the whole scene from nothing (no .blend file to keep in sync) and renders
it on a transparent background, so the same frames sit on every time-of-day
backdrop. See plans/hero-3d-baia.md.

Run headless from the repo root:

  blender -b -P blender/baia_letters.py -- --preview              # 3 stills: -28, 0, +28 deg
  blender -b -P blender/baia_letters.py -- --frames               # the 57-frame sway
  blender -b -P blender/baia_letters.py -- --preview --font space --samples 32

Output goes to blender/out/<font>/ (gitignored).
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))

FONTS = {
    # The header wordmark font, frozen to its Bold instance (tried, felt carved)
    "space": {"file": "SpaceGrotesk-Bold.ttf", "spacing": 1.0},
    # Round and soft; the first pick, kept for comparison
    "fredoka": {"file": "Fredoka-Bold.ttf", "spacing": 1.02},
    # The runner-up: bolder and flatter, poster-like
    "titan": {"file": "TitanOne-Regular.ttf", "spacing": 1.0},
    # The chosen face: puffy and playful, like whipped cream piped into letters
    "dynapuff": {"file": "DynaPuff-Bold.ttf", "spacing": 1.02},
}

# The site cream. Tuned with EXPOSURE so the lit front faces land on it.
CREAM = "#F5E9D6"
EXPOSURE = 0.2

SWAY_DEG = 28       # the word turns between -28 and +28 degrees
SWAY_STEP = 1       # 1 degree a frame -> 57 frames
TILT_PER_DEG = 0.1  # a slight forward/back tilt that follows the sway


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="baia_letters.py")
    p.add_argument("--font", choices=FONTS.keys(), default="dynapuff")
    p.add_argument("--preview", action="store_true", help="render 3 stills")
    p.add_argument("--frames", action="store_true", help="render the full sway")
    p.add_argument("--samples", type=int, default=None)
    p.add_argument("--width", type=int, default=1600)
    p.add_argument("--height", type=int, default=800)
    p.add_argument("--depth", type=float, default=0.22, help="extrude, in letter-size units")
    p.add_argument("--bevel", type=float, default=0.06, help="rounded edge radius")
    p.add_argument("--explode", type=int, default=0,
                   help="exploded view: split into N layers spread from front to back")
    p.add_argument("--subject", choices=["word", "mark"], default="word",
                   help="the BAIA word, or the logo mark (flower, palm, cup, waves)")
    p.add_argument("--spacing", type=float, default=0.45, help="exploded: layer to layer, front to back")
    p.add_argument("--stagger", type=float, default=0.05, help="exploded: each layer drops this much down-right")
    p.add_argument("--out", default=os.path.join(HERE, "out"))
    p.add_argument("--save-blend", action="store_true", help="also save the scene as a .blend to open in Blender")
    a = p.parse_args(argv)
    if not (a.preview or a.frames or a.save_blend):
        a.preview = True
    return a


def hex_to_linear(h):
    h = h.lstrip("#")
    def ch(v):
        c = int(v, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch(h[0:2]), ch(h[2:4]), ch(h[4:6]), 1.0)


def set_input(node, names, value):
    """Principled input names shift between Blender versions; try each."""
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return
    print(f"[baia] note: no input {names} on {node.name}")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


# Exploded layers, front to back: the Einspanner from the top of the glass
# down. Whipped cream, its cocoa dusting, the coffee, the milk.
LAYER_COLORS = ["#F5E9D6", "#7A4024", "#C08A55", "#EDE2CF"]


def make_material(color=CREAM):
    mat = bpy.data.materials.new(f"BAIA {color}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    set_input(bsdf, "Base Color", hex_to_linear(color))
    set_input(bsdf, "Roughness", 0.32)
    # Milky: a little light travels under the surface
    set_input(bsdf, ["Subsurface Weight", "Subsurface"], 0.35)
    set_input(bsdf, "Subsurface Radius", (1.0, 0.55, 0.3))
    set_input(bsdf, "Subsurface Scale", 0.06)
    # The wet, glossy highlight
    set_input(bsdf, ["Coat Weight", "Clearcoat"], 0.7)
    set_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.06)
    return mat


def to_standing_mesh(curve, name, color):
    """Curve -> smooth-shaded mesh, stood up to face the camera."""
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    for poly in obj.data.polygons:
        poly.use_smooth = True
    wn = obj.modifiers.new("Weighted Normal", "WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA"
    wn.weight = 100
    wn.keep_sharp = True
    obj.data.materials.append(make_material(color))
    obj.rotation_euler = (math.radians(90), 0, 0)
    return obj


def place_layers(objs, spacing, stagger):
    """Spread layers front (first) to back (last), centred on the pivot.
    Standing up, local +Z faces the camera, so 'back' is -Z; the stagger
    steps each one down and to the right, like an exploded diagram."""
    pivot = bpy.data.objects.new("Pivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    n = len(objs)
    for i, obj in enumerate(objs):
        k = i - (n - 1) / 2
        obj.parent = pivot
        # world: x right, y away from the camera, z up
        obj.location = (k * stagger, k * spacing, -k * stagger)
    bpy.context.view_layer.update()
    return pivot


def make_exploded_word(font_key, layers, spacing, stagger):
    spec = FONTS[font_key]
    objs = []
    for i in range(layers):
        curve = bpy.data.curves.new(f"BAIA {i}", type="FONT")
        curve.body = "BAIA"
        curve.font = bpy.data.fonts.load(os.path.join(HERE, "fonts", spec["file"]), check_existing=True)
        curve.size = 1.0
        curve.space_character = spec["spacing"]
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        # Thin slabs: a gap between each, so the layers read as separate
        curve.extrude = 0.03
        curve.bevel_depth = 0.028
        curve.offset = -0.028
        curve.bevel_resolution = 6
        curve.resolution_u = 20
        objs.append(to_standing_mesh(curve, f"BAIA layer {i}", LAYER_COLORS[i % len(LAYER_COLORS)]))
    return place_layers(objs, spacing, stagger), objs


def make_exploded_mark(spacing, stagger):
    """The logo mark, one glyph per layer: flower in front, then the palm,
    the cup, and the waves at the back. Outlines from blender/trace_logo.py."""
    import json
    with open(os.path.join(HERE, "logo_mark.json"), encoding="utf-8") as f:
        glyphs = json.load(f)
    objs = []
    for i, key in enumerate(["flower", "palm", "cup", "waves"]):
        curve = bpy.data.curves.new(key, type="CURVE")
        curve.dimensions = "2D"
        curve.fill_mode = "BOTH"
        for outline in glyphs[key]:
            sp = curve.splines.new("POLY")
            sp.points.add(len(outline) - 1)
            for pt, (x, y) in zip(sp.points, outline):
                pt.co = (x * 0.6, y * 0.6, 0.0, 1.0)
            sp.use_cyclic_u = True
        # The waves and palm are strokes about 0.04 wide at this scale: keep
        # the bevel under half of that so they stay solid
        curve.extrude = 0.045
        curve.bevel_depth = 0.016
        curve.offset = -0.016
        curve.bevel_resolution = 6
        objs.append(to_standing_mesh(curve, f"Mark {key}", LAYER_COLORS[i % len(LAYER_COLORS)]))
    return place_layers(objs, spacing, stagger), objs


def make_letters(font_key, depth, bevel):
    spec = FONTS[font_key]
    curve = bpy.data.curves.new("BAIA", type="FONT")
    curve.body = "BAIA"
    curve.font = bpy.data.fonts.load(os.path.join(HERE, "fonts", spec["file"]))
    curve.size = 1.0
    curve.space_character = spec["spacing"]
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = depth
    curve.bevel_depth = bevel
    # The bevel grows the outline outwards by its radius, which swells the
    # strokes and closes up the holes in the B and A. Pull the outline in by
    # the same amount first, so the glyph keeps its true shape and its
    # counters stay open; only the edges get rounded.
    curve.offset = -bevel
    curve.bevel_resolution = 8
    curve.resolution_u = 24

    obj = bpy.data.objects.new("BAIA", curve)
    bpy.context.scene.collection.objects.link(obj)

    # To a mesh, so the shading can be smoothed properly
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # Flat fronts stay flat; only the rounded edges blend
    wn = obj.modifiers.new("Weighted Normal", "WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA"
    wn.weight = 100
    wn.keep_sharp = True

    obj.data.materials.append(make_material())
    # Stand the word up, facing the camera (which looks along +Y)
    obj.rotation_euler = (math.radians(90), 0, 0)

    # A pivot to sway around, so the letters' own rotation stays untouched
    pivot = bpy.data.objects.new("Pivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    obj.parent = pivot
    bpy.context.view_layer.update()
    return pivot, obj


def add_area_light(name, location, target, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def aim(obj, target=(0, 0, 0)):
    from mathutils import Vector
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_camera(word_width, width, height):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 85  # long lens: less perspective stretch on the near letters
    cam_data.sensor_fit = "HORIZONTAL"
    cam_data.sensor_width = 36
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    # Frame the word so it fills ~74% of the width when facing front
    fill = 0.74
    half_fov = math.atan((cam_data.sensor_width / 2) / cam_data.lens)
    dist = (word_width / fill / 2) / math.tan(half_fov)
    cam.location = (0, -dist, 0)
    aim(cam, (0, 0, 0))
    return cam


def make_world():
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.9, 0.88, 0.85, 1)
    bg.inputs["Strength"].default_value = 0.15
    bpy.context.scene.world = world


def setup_render(scene, args, samples):
    scene.render.engine = "CYCLES"
    scene.render.film_transparent = True
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    # Standard, not AgX: AgX greys the cream out, and these frames must sit on
    # flat brand colours, so true colour matters more than highlight roll-off
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = EXPOSURE
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True

    # Use the GPU when there is one
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type != "CPU"]
            if gpus:
                for d in prefs.devices:
                    d.use = True
                scene.cycles.device = "GPU"
                print(f"[baia] rendering on {kind}: {', '.join(d.name for d in gpus)}")
                return
        print("[baia] no GPU found, rendering on CPU")
    except Exception as e:  # noqa: BLE001
        print(f"[baia] GPU setup skipped ({e}), rendering on CPU")


def pose(pivot, yaw_deg):
    pivot.rotation_euler = (math.radians(-yaw_deg * TILT_PER_DEG), 0, math.radians(yaw_deg))


def render_to(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[baia] wrote {path}")


def main():
    args = parse_args()
    samples = args.samples or (64 if args.preview and not args.frames else 128)
    scene = reset_scene()

    if args.explode or args.subject == "mark":
        if args.subject == "mark":
            pivot, objs = make_exploded_mark(args.spacing, args.stagger)
            name = "mark-explode"
        else:
            pivot, objs = make_exploded_word(args.font, args.explode or 4, args.spacing, args.stagger)
            name = f"{args.font}-explode"
        xs = [(o.matrix_world @ Vector(c)).x for o in objs for c in o.bound_box]
        word_width = max(xs) - min(xs)
    else:
        pivot, word = make_letters(args.font, args.depth, args.bevel)
        word_width = word.dimensions.x
        name = args.font
    make_camera(word_width, args.width, args.height)
    make_world()

    # Soft key from the upper left, a rim from behind, a low warm fill
    add_area_light("Key", (-2.4, -4.6, 2.2), (0, 0, 0), 260, 3.0)
    add_area_light("Rim", (2.6, 3.0, 2.2), (0, 0, 0.1), 160, 2.0)
    add_area_light("Fill", (3.4, -2.6, -0.8), (0, 0, 0), 40, 4.0, (1.0, 0.94, 0.86))

    setup_render(scene, args, samples)

    out = os.path.join(args.out, name)
    os.makedirs(out, exist_ok=True)

    if args.save_blend:
        pose(pivot, 0)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "baia_letters.blend"))

    if args.preview:
        for yaw in (-SWAY_DEG, 0, SWAY_DEG):
            pose(pivot, yaw)
            render_to(scene, os.path.join(out, f"preview_{yaw:+d}.png"))

    if args.frames:
        steps = int(2 * SWAY_DEG / SWAY_STEP)
        for i in range(steps + 1):
            pose(pivot, -SWAY_DEG + i * SWAY_STEP)
            render_to(scene, os.path.join(out, "frames", f"frame-{i:02d}.png"))


main()
