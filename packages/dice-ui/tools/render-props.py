#!/usr/bin/env python3
# render-props.py — v1 (2026-09-06)
#
# Reproduces packages/dice-ui/assets/dice/{1..6}.webp and
# packages/dice-ui/assets/cup.webp from first principles: geometry modeled
# in this file (this repository's own work, no license to carry), textured
# with a Poly Haven CC0 leather scan (the cup only — the die needs no
# photographic material, see `build_ivory_material`'s own comment), and
# rendered with Blender's Cycles. Structurally this is
# `mahjong-tile-ui/tools/process-svg-tiles.mjs`: a `fetch` stage that pulls
# the one external input this pipeline has, and a `render` stage that is
# otherwise fully offline and deterministic — no bundler, no npm dependency,
# never wired into CI. The committed WebP files are the artifact; this
# script is how anyone reproduces or re-tunes them.
#
# WHY BLENDER REPLACED THE FLAT SVG BODY. `die-body.ts`/`die-pips.ts`/
# `cup-body.ts` drew flat fills with a two-tone lit/shaded bevel — cheap,
# themeable, and the thing the product owner rejected outright ("no me
# gustan" on the dice, "quiero algo de calidad" on the cup). A rendered
# raster face can carry real material and real depth that flat vector fills
# cannot; see each builder function below for what specifically replaces
# what and why.
#
# THE ONE CONSTRAINT THAT SHAPES EVERY DIE FACE DECISION: the die stays a
# real `transform-style: preserve-3d` CSS cube (`die.ts`, untouched by this
# change) — a die's six facelets rotate in actual 3D space to their resting
# `FACE_ROTATION` pose, and the toss animation sweeps them through
# arbitrary orientations first. A texture with an obvious light DIRECTION
# baked in (a highlight top-left, a raking shadow) stays fixed to that
# facelet's own pixels regardless of which way the cube has turned — a face
# lit from "above" when flat-on-screen is still lit from "above" once that
# same facelet rotates to the cube's side, which reads as wrong the instant
# it is looked at turning. So every die face is lit with a camera-aligned,
# shadowless setup (`setup_flat_lighting_and_camera`) — material and local
# depth cues are baked in, a global light direction is not. The cubilete has
# no such constraint: `.hexdev-dice-cup`'s only transform is a flat 2D
# `rotate(9deg)` in the screen plane (`dice-styles.ts`), geometrically
# identical to tilting a printed photograph, so it is lit with an ordinary
# directional key/fill pair (`setup_cup_lighting_and_camera`) — see that
# function's own comment.
#
# Requires on PATH: blender (5.x), magick (ImageMagick, PNG -> WebP only —
# Blender renders the honest pixels, magick only encodes, the same
# two-tools-one-job split `process-svg-deck.mjs` already uses). `fetch`
# additionally needs network access to Poly Haven's public CDN; `render`
# needs neither network nor bpy features beyond the standard install.
#
# Usage (every command is a real subprocess, run from the repository root):
#
#   blender --background --python packages/dice-ui/tools/render-props.py -- \
#       fetch <textures-dir>
#       Downloads the three brown_leather 1k maps (CC0, Poly Haven) this
#       script's cup material reads: albedo, roughness, and an OpenGL-space
#       normal map. 1k, not 8k: the final render is a few hundred pixels
#       across, and an 8k scan would cost download time and disk for detail
#       no output pixel could ever resolve.
#
#   blender --background --python packages/dice-ui/tools/render-props.py -- \
#       render <textures-dir> <png-out-dir>
#       Renders the six die faces and the cup to <png-out-dir> as
#       transparent PNG. Requires `fetch` to have already populated
#       <textures-dir>.
#
#   packages/dice-ui/tools/render-props.py encode <png-dir> <webp-out-dir>
#       Converts every PNG in <png-dir> to lossy WebP (quality 88, alpha
#       preserved) via `magick`. Runs under plain python3 — no bpy needed —
#       and is the only stage this repository's asset pipeline actually
#       commits the OUTPUT of.
import math
import os
import subprocess
import sys

# ---- fetch (no bpy needed) -------------------------------------------------

POLYHAVEN_BASE = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_leather"
LEATHER_FILES = {
    "brown_leather_albedo_1k.jpg": f"{POLYHAVEN_BASE}/brown_leather_albedo_1k.jpg",
    "brown_leather_rough_1k.jpg": f"{POLYHAVEN_BASE}/brown_leather_rough_1k.jpg",
    "brown_leather_nor_gl_1k.jpg": f"{POLYHAVEN_BASE}/brown_leather_nor_gl_1k.jpg",
}


def fetch_textures(out_dir):
    """CC0 (Poly Haven, https://polyhaven.com/a/brown_leather) — no
    attribution obligation, unlike the CC BY-SA tile/deck art this
    repository also ships. Downloaded at build time into a directory this
    tool owns, never committed itself; only the finished, encoded WebP
    (`assets/cup.webp`) is checked in, exactly like every other rasterized
    asset in this repository."""
    os.makedirs(out_dir, exist_ok=True)
    import urllib.request

    for filename, url in LEATHER_FILES.items():
        dest = os.path.join(out_dir, filename)
        if os.path.exists(dest):
            print(f"already have {filename}")
            continue
        request = urllib.request.Request(url, headers={"User-Agent": "convite-dice-art/1.0 (build)"})
        with urllib.request.urlopen(request) as response, open(dest, "wb") as fh:
            fh.write(response.read())
        print(f"fetched {filename}")


# ---- die face ---------------------------------------------------------

# Ported verbatim from packages/dice-ui/src/geometry.ts (PIP_SLOTS /
# FACE_PIP_SLOTS) so the carved pips land on the SAME canonical 3x3 grid the
# CSS/SVG geometry already committed to — one layout decided once, not two
# numbers that could quietly drift apart if either were ever edited alone.
DIE_SIZE = 100
PIP_MARGIN = 26
PIP_MID = DIE_SIZE / 2
PIP_FAR = DIE_SIZE - PIP_MARGIN
PIP_SLOTS_2D = [
    (PIP_MARGIN, PIP_MARGIN), (PIP_MID, PIP_MARGIN), (PIP_FAR, PIP_MARGIN),
    (PIP_MARGIN, PIP_MID), (PIP_MID, PIP_MID), (PIP_FAR, PIP_MID),
    (PIP_MARGIN, PIP_FAR), (PIP_MID, PIP_FAR), (PIP_FAR, PIP_FAR),
]
FACE_PIP_SLOTS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
PIP_RADIUS_UNITS = 7  # out of DIE_SIZE=100, matches geometry.ts's PIP_RADIUS

# `.hexdev-dice-scene` is 110 CSS px (dice-styles.ts); the deck's own rule
# (spanish-deck-ui/tools/process-svg-deck.mjs:25-29) is ~2.7x the largest
# on-screen width, so DIE_FACE_SIZE = ceil(110 * 2.7) = 297. Square, because
# a die's face is square at every one of its six rotations.
DIE_FACE_SIZE = 297


def slot_to_local(v):
    """SVG-grid units (0..100) -> plate-local coords in a [-1, 1] square."""
    return (v - DIE_SIZE / 2) / (DIE_SIZE / 2)


def build_die_plate():
    import bpy

    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 0))
    plate = bpy.context.object
    plate.scale = (1.0, 1.0, 0.16)
    bpy.ops.object.transform_apply(scale=True)
    # Barely-rounded corners ("esquinas apenas redondeadas") — a small
    # bevel, not the die's whole silhouette turned into a rounded square.
    bevel = plate.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.02
    bevel.segments = 4
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return plate


def carve_pips(plate, face):
    """A pip is a PERFORATION, not a printed dot — the exact depth cue the
    task calls out by name ("el punto es una perforación en el marfil, con
    su sombra interior propia"). Each pip is a real hemispherical crater
    carved by a boolean difference against a UV sphere, at the radius/
    position `PIP_SLOTS_2D`/`PIP_RADIUS_UNITS` already commit to."""
    import bpy

    pip_r = PIP_RADIUS_UNITS / (DIE_SIZE / 2) * 0.86
    cutters = []
    for idx in FACE_PIP_SLOTS[face]:
        sx, sy = PIP_SLOTS_2D[idx]
        x = slot_to_local(sx)
        y = -slot_to_local(sy)  # SVG y grows downward; Blender y grows up
        # Fine tessellation (64x32), not the 32x16 default: a first pass at
        # the default resolution showed visible concentric facet rings
        # under zoom — this small a crater needs a genuinely smooth sphere,
        # not a coarse one merely smooth-shaded.
        bpy.ops.mesh.primitive_uv_sphere_add(radius=pip_r, segments=64, ring_count=32, location=(x, y, 0.16))
        cutters.append(bpy.context.object)
    if len(cutters) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for cutter_obj in cutters:
            cutter_obj.select_set(True)
        bpy.context.view_layer.objects.active = cutters[0]
        bpy.ops.object.join()
    cutter = cutters[0]
    boolean = plate.modifiers.new("pips", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    bpy.context.view_layer.objects.active = plate
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # Angle-based smoothing, not a blanket `shade_smooth()`: it removes the
    # crater's facet banding while leaving the plate's own sharp outer
    # silhouette and bevel-to-flat transition crisp.
    bpy.ops.object.shade_auto_smooth(angle=0.4)


def build_ivory_material():
    """Ivory needs no photographic scan — unlike the cup's leather, a die's
    bone/ivory face is close enough to a procedural dielectric (warm base
    colour, moderate roughness, a whisper of subsurface and grain) that a
    real photo scan would add licensing surface for no visible gain at this
    render size. See the module docstring for why NO node here reads a
    light's direction: every depth cue below is a LOCAL geometric measure.
    """
    import bpy

    mat = bpy.data.materials.new("ivory")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.25
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.03

    # THE PIP'S OWN SHADOW, GUARANTEED RATHER THAN HOPED FOR. An Ambient
    # Occlusion node is a purely LOCAL geometric measure — how much of the
    # hemisphere above a point is blocked by nearby surface — independent of
    # any single light's direction. Mixing a darker ivory into the crevice
    # this way means the carved pip reads as a real hollow under whatever
    # lighting setup ends up on the world/area light below, and — the whole
    # point of this render existing — under whatever apparent orientation
    # the CSS cube later shows it at, since the darkening travels with the
    # geometry, not with a baked light direction.
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.22
    ao.samples = 16
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.85
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs["Color1"].default_value = (0.42, 0.33, 0.22, 1.0)  # crevice
    mix.inputs["Color2"].default_value = (0.87, 0.80, 0.62, 1.0)  # flat ivory
    links.new(ao.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 60.0
    noise.inputs["Detail"].default_value = 3.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def setup_flat_lighting_and_camera(scene, frame_half_extent):
    """Orthographic, camera-aligned, shadowless-on-the-flat: see the module
    docstring for why a die face may carry no visible light DIRECTION.
    Orthographic (not perspective) additionally keeps every face's edges
    genuinely parallel — a perspective camera's own barrel-ish convergence
    would fight the CSS cube's own perspective simulation instead of
    supplying a flat texture for it to apply that simulation to."""
    import bpy

    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.75, 0.73, 1.0)
    bg.inputs["Strength"].default_value = 0.9

    bpy.ops.object.camera_add(location=(0, 0, 3.0), rotation=(0, 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = frame_half_extent * 2
    scene.camera = cam

    # A large, soft area light co-located with the camera (ring-light /
    # macro-photography style): its falloff across a subject this small is
    # nearly flat (no visible directional gradient on the flat plate), yet a
    # small concave dimple still self-shadows because its inner wall is
    # steeply angled away from a light that arrives almost straight-on —
    # exactly the "material yes, directional key light no" split this
    # render exists to hold.
    bpy.ops.object.light_add(type="AREA", location=(0, 0, 2.5))
    light = bpy.context.object
    light.data.size = 3.2
    light.data.energy = 22
    return cam


def render_die_face(face, out_path):
    import bpy

    clear_scene()
    scene = setup_render(DIE_FACE_SIZE, DIE_FACE_SIZE)
    plate = build_die_plate()
    carve_pips(plate, face)
    # THE BUG THAT COST HOURS, RECORDED SO NO ONE PAYS FOR IT TWICE: the
    # boolean modifier's cutter sphere carries its own (empty) material
    # slot, and applying the modifier leaves that slot on the PLATE at
    # index 0 — every polygon's `material_index` still reads 0, but slot 0
    # is now the cutter's empty one, so appending the real material below
    # lands it at index 1 and every face keeps pointing at nothing. Blender
    # then silently falls back to its default flat grey material for the
    # ENTIRE mesh — not just the carved cavity. `materials.clear()`
    # guarantees slot 0 is OUR material before anything else can claim it.
    plate.data.materials.clear()
    plate.data.materials.append(build_ivory_material())
    setup_flat_lighting_and_camera(scene, 1.12)
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)


# ---- cubilete ---------------------------------------------------------

CUP_WIDTH = 100
CUP_HEIGHT = 118
# `.hexdev-dice-cup` is 84x99 CSS px (dice-styles.ts); the same ~2.7x rule:
# ceil(84 * 2.7) = 228, and 228 / (CUP_WIDTH / CUP_HEIGHT) = 269 rounds
# evenly — a fresh derivation, not a copy of the die's own numbers, because
# the cup's on-screen box has its own aspect ratio.
CUP_ART_WIDTH = 228
CUP_ART_HEIGHT = 269


def build_cup_mesh(leather_mat, felt_mat):
    """A real hollow vessel, not a solid barrel with a lid glued on top.

    ONE OPEN TUBE, SOLIDIFIED — not two independently-modeled shells. A
    `primitive_cylinder_add` capped on both ends, with the TOP cap deleted
    before `Solidify` runs inward, gives: an outer wall (the original
    surface), an inner wall + inner floor (Solidify's mirrored copy), and —
    at the deleted cap's edge, the one place Solidify has no matching
    original face to mirror — a connecting RING FACE it synthesizes on its
    own. That ring IS the rim's own wall thickness: a band with real width,
    not a stroke, which is the exact defect `cup-body.ts`'s SVG-era owner
    review named ("no wall, no material, no looking in").
    """
    import bmesh
    import bpy

    radius = CUP_WIDTH / 200  # 1.0 at CUP_WIDTH=100 units
    height = CUP_HEIGHT / 200
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=height * 2, end_fill_type="NGON")
    cup = bpy.context.object

    # Delete the TOP cap only, leaving the bottom solid — a real cup has a
    # closed base and an open mouth, never the reverse.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bm = bmesh.from_edit_mesh(cup.data)
    bm.faces.ensure_lookup_table()
    top_face = max(bm.faces, key=lambda f: f.calc_center_median().z)
    top_face.select = True
    bmesh.update_edit_mesh(cup.data)
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Slot 0 = leather (outer + rim), slot 1 = green felt (inner wall +
    # inner floor) — Solidify's `material_offset` below is what routes the
    # mirrored inner geometry to slot 1 automatically, with no manual face
    # selection to keep in sync if the mesh topology ever changes.
    #
    # THE SLOTS MUST EXIST BEFORE `modifier_apply`, NOT AFTER. Blender
    # clamps every polygon's `material_index` to the object's CURRENT slot
    # count at the instant a modifier bakes it in — apply Solidify against
    # zero slots and its `material_offset=1` computes index 1 internally
    # and then clamps it straight back to 0, silently, with no error. A
    # felt slot appended only afterward is never wrong on its own terms;
    # every polygon has already forgotten it was ever meant to point at it.
    cup.data.materials.append(leather_mat)
    cup.data.materials.append(felt_mat)
    solidify = cup.modifiers.new("wall", "SOLIDIFY")
    solidify.thickness = 0.09
    solidify.offset = -1.0  # grow inward from the outer surface
    solidify.material_offset = 1
    solidify.use_even_offset = True
    bpy.context.view_layer.objects.active = cup
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.shade_auto_smooth(angle=0.5)
    return cup


def _leather_image(textures_dir, name):
    import bpy

    return bpy.data.images.load(os.path.join(textures_dir, name))


def build_leather_material(textures_dir):
    import bpy

    mat = bpy.data.materials.new("leather")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]

    # UV, NOT Generated — `primitive_cylinder_add` ships a real cylindrical
    # UV unwrap (U around the circumference, V along the height); Generated
    # coordinates are only the object's bounding box remapped to 0..1, which
    # wraps a flat texture around a curved wall with visible pinching —
    # rendered and looked at, that pinch read as hard vertical wood-grain
    # streaks instead of leather's own mottled, non-linear grain.
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (2.2, 1.4, 1.0)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    albedo = nodes.new("ShaderNodeTexImage")
    albedo.image = _leather_image(textures_dir, "brown_leather_albedo_1k.jpg")
    albedo.image.colorspace_settings.name = "sRGB"
    rough = nodes.new("ShaderNodeTexImage")
    rough.image = _leather_image(textures_dir, "brown_leather_rough_1k.jpg")
    rough.image.colorspace_settings.name = "Non-Color"
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.image = _leather_image(textures_dir, "brown_leather_nor_gl_1k.jpg")
    normal_tex.image.colorspace_settings.name = "Non-Color"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.6

    for tex in (albedo, rough, normal_tex):
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])

    # A warm multiply over the raw scan rather than the scan verbatim: this
    # asset is CC0 (Poly Haven, brown_leather) so nothing REQUIRES the tint,
    # but the raw scan reads slightly too orange/red for a worn cubilete —
    # this is purely a look choice, never a licensing one.
    tint = nodes.new("ShaderNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs["Fac"].default_value = 0.55
    tint.inputs["Color2"].default_value = (0.72, 0.58, 0.42, 1.0)
    links.new(albedo.outputs["Color"], tint.inputs["Color1"])
    links.new(tint.outputs["Color"], bsdf.inputs["Base Color"])

    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35

    _add_cross_stitch_seam(nodes, links, bsdf, coord, mapping, tint, rough)
    return mat


def _add_cross_stitch_seam(nodes, links, bsdf, coord, mapping, tint, rough):
    """The one construction detail the verified reference names by name:
    "costura en cruz con hilo encerado". A real cubilete is leather wrapped
    around a stiff core and sewn shut along ONE vertical seam; a smooth,
    seamless leather tube reads as a leather-TEXTURED cylinder, not as a
    vessel actually built by hand.

    Built from UV alone, no modeled geometry: a thin vertical band at a
    fixed U (the seam's own line, via a sharpened `abs(u-0.5)` mask) crossed
    with two opposite-diagonal Wave textures — overlapping opposite
    diagonals is what reads as repeated X's rather than one plain hatch.
    Waxed thread is pale and less glossy-dark than tanned leather, so it is
    mixed in as its own colour AND its own (lower) roughness, not merely a
    bump map that would leave the colour unchanged.
    """
    # The RAW, unscaled UV — never the leather-grain `mapping` output, whose
    # 2.2x U scale would otherwise repeat the seam 2.2 times around the cup
    # instead of the ONE real seam a cylindrical UV unwrap's U=0.5 already
    # names once per full turn.
    seam_u = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["UV"], seam_u.inputs["Vector"])
    seam_center = nodes.new("ShaderNodeMath")
    seam_center.operation = "SUBTRACT"
    seam_center.inputs[1].default_value = 0.5
    links.new(seam_u.outputs["X"], seam_center.inputs[0])
    seam_abs = nodes.new("ShaderNodeMath")
    seam_abs.operation = "ABSOLUTE"
    links.new(seam_center.outputs["Value"], seam_abs.inputs[0])
    seam_band = nodes.new("ShaderNodeValToRGB")
    seam_band.color_ramp.elements[0].position = 0.0
    seam_band.color_ramp.elements[1].position = 0.010
    seam_band.color_ramp.elements[0].color = (1, 1, 1, 1)
    seam_band.color_ramp.elements[1].color = (0, 0, 0, 1)
    links.new(seam_abs.outputs["Value"], seam_band.inputs["Fac"])

    wave_a = nodes.new("ShaderNodeTexWave")
    wave_a.bands_direction = "DIAGONAL"
    wave_a.inputs["Scale"].default_value = 55.0
    links.new(mapping.outputs["Vector"], wave_a.inputs["Vector"])
    wave_b = nodes.new("ShaderNodeTexWave")
    wave_b.bands_direction = "DIAGONAL"
    wave_b.inputs["Scale"].default_value = -55.0
    links.new(mapping.outputs["Vector"], wave_b.inputs["Vector"])
    cross = nodes.new("ShaderNodeMixRGB")
    cross.blend_type = "LIGHTEN"
    cross.inputs["Fac"].default_value = 1.0
    links.new(wave_a.outputs["Fac"], cross.inputs["Color1"])
    links.new(wave_b.outputs["Fac"], cross.inputs["Color2"])
    stitch_ramp = nodes.new("ShaderNodeValToRGB")
    stitch_ramp.color_ramp.elements[0].position = 0.62
    stitch_ramp.color_ramp.elements[1].position = 0.72
    links.new(cross.outputs["Color"], stitch_ramp.inputs["Fac"])

    seam_mask = nodes.new("ShaderNodeMixRGB")
    seam_mask.blend_type = "MULTIPLY"
    links.new(seam_band.outputs["Color"], seam_mask.inputs["Color1"])
    links.new(stitch_ramp.outputs["Color"], seam_mask.inputs["Color2"])

    # Fac=seam_mask must land on the THREAD colour at mask=1 (on a stitch
    # mark) and the LEATHER colour at mask=0 — MixRGB resolves Fac=1 to
    # Color2, so the leather goes in Color1 and the thread in Color2, never
    # the other way round.
    thread_color = nodes.new("ShaderNodeMixRGB")
    thread_color.inputs["Color2"].default_value = (0.86, 0.80, 0.62, 1.0)  # waxed thread
    links.new(tint.outputs["Color"], thread_color.inputs["Color1"])
    links.new(seam_mask.outputs["Color"], thread_color.inputs["Fac"])
    links.new(thread_color.outputs["Color"], bsdf.inputs["Base Color"])

    thread_rough = nodes.new("ShaderNodeMixRGB")
    thread_rough.inputs["Color2"].default_value = (0.3, 0.3, 0.3, 1.0)
    links.new(rough.outputs["Color"], thread_rough.inputs["Color1"])
    links.new(seam_mask.outputs["Color"], thread_rough.inputs["Fac"])
    links.new(thread_rough.outputs["Color"], bsdf.inputs["Roughness"])


def build_felt_material():
    import bpy

    mat = bpy.data.materials.new("felt")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    # Dark, saturated green, fully matte — a felt lining absorbs light and
    # scatters it diffusely with no sheen at all; ANY visible specular here
    # would read as wet or varnished, not textile. Deliberately much darker
    # than the leather so the interior reads as a genuine cavity the light
    # does not reach as directly — the contrast `cup-body.ts`'s SVG-era
    # `--dice-cup-interior-shade`/`-light` split faked by hand, here falling
    # out of real geometry and a real light instead.
    bsdf.inputs["Base Color"].default_value = (0.035, 0.11, 0.06, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.92
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.05
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 220.0
    noise.inputs["Detail"].default_value = 4.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def setup_cup_lighting_and_camera(scene):
    """Ordinary directional studio lighting — deliberately NOT the die
    face's flat/shadowless discipline. The cup is rendered ONCE and never
    rotated in 3D afterward (`.hexdev-dice-cup`'s only transform is a flat
    2D `rotate(9deg)` in the screen plane, geometrically identical to
    tilting a printed photograph), so a baked light direction can never end
    up facing the wrong way the way a CSS-cube facelet's would. A real
    key/fill pair is what makes leather read as leather and is what
    separates the far interior wall (lit) from the near one (shadowed) —
    the contrast the task names as what "delata que está hueco"."""
    import bpy
    import mathutils

    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.05, 0.05, 0.06, 1.0)
    bg.inputs["Strength"].default_value = 0.25

    bpy.ops.object.light_add(type="AREA", location=(-1.6, -1.4, 2.4))
    key = bpy.context.object
    key.data.size = 1.8
    key.data.energy = 140
    key.data.color = (1.0, 0.95, 0.85)
    key.rotation_euler = (math.radians(45), 0, math.radians(-35))

    bpy.ops.object.light_add(type="AREA", location=(1.8, -0.6, 1.2))
    fill = bpy.context.object
    fill.data.size = 2.5
    fill.data.energy = 35
    fill.data.color = (0.85, 0.9, 1.0)
    fill.rotation_euler = (math.radians(70), 0, math.radians(120))

    bpy.ops.object.camera_add(location=(0, -2.15, 1.5))
    cam = bpy.context.object
    cam.data.type = "PERSP"
    cam.data.lens = 40
    direction = mathutils.Vector((0, 0, 0.35)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam


def render_cup(textures_dir, out_path):
    import bpy

    clear_scene()
    scene = setup_render(CUP_ART_WIDTH, CUP_ART_HEIGHT)
    scene.cycles.samples = 256
    leather = build_leather_material(textures_dir)
    felt = build_felt_material()
    cup = build_cup_mesh(leather, felt)
    # Turn the seam toward the silhouette's edge rather than dead-centre —
    # a real product shot would not confront the camera with the seam
    # either, and the cylinder's own perspective foreshortening makes a
    # near-edge seam read as the thin line it actually is instead of the
    # widest, least-foreshortened band on the whole cup.
    cup.rotation_euler = (0, 0, math.radians(68))
    setup_cup_lighting_and_camera(scene)
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)


# ---- shared bpy helpers -----------------------------------------------


def clear_scene():
    import bpy

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.images):
        bpy.data.images.remove(block)
    for block in list(bpy.data.worlds):
        bpy.data.worlds.remove(block)


def setup_render(width, height):
    import bpy

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    # Standard, not AgX/Filmic: this asset pipeline wants the literal colours
    # the shader graph specifies, not a cinematic tone-map that compresses
    # highlights and desaturates the exact ivory/leather tones dialed in by
    # eye — a filmic curve fighting the colour choice would just mean
    # re-tuning the SAME target twice.
    scene.view_settings.view_transform = "Standard"
    return scene


def render_all(textures_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for face in (1, 2, 3, 4, 5, 6):
        render_die_face(face, os.path.join(out_dir, f"die-{face}.png"))
    render_cup(textures_dir, os.path.join(out_dir, "cup.png"))


# ---- encode (no bpy needed) ---------------------------------------------


def encode_webp(png_dir, out_dir):
    """PNG -> WebP only, via `magick` — the identical division of labour
    `process-svg-tiles.mjs` uses: the renderer renders, the encoder only
    encodes. Lossy (quality 88), never lossless: unlike the tile/deck flat
    vector art, these renders carry continuous photographic-style gradients
    (the AO-shaded pip, the leather grain) where lossless buys exactness
    this content has no flat regions to make cheap, at several times the
    bytes for a difference nobody looking at a ~30px die face could see."""
    os.makedirs(out_dir, exist_ok=True)
    for filename in sorted(os.listdir(png_dir)):
        if not filename.endswith(".png"):
            continue
        stem = filename[: -len(".png")]
        src = os.path.join(png_dir, filename)
        dest = os.path.join(out_dir, f"{stem}.webp")
        subprocess.run(["magick", src, "-define", "webp:lossless=false", "-quality", "88", dest], check=True)
        print(f"encoded {stem}.webp")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    command = argv[0] if argv else None
    if command == "fetch" and len(argv) > 1:
        fetch_textures(os.path.abspath(argv[1]))
    elif command == "render" and len(argv) > 2:
        render_all(os.path.abspath(argv[1]), os.path.abspath(argv[2]))
    elif command == "encode" and len(argv) > 2:
        encode_webp(os.path.abspath(argv[1]), os.path.abspath(argv[2]))
    else:
        print("usage: render-props.py fetch <textures-dir> | render <textures-dir> <png-out-dir> | encode <png-dir> <webp-out-dir>")
        sys.exit(1)
