import {
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  SkinnedMesh,
} from 'three';
import type { BufferGeometry, Material, MaterialEventMap, Object3D, RenderItem } from 'three';

import { depthGeometryOf } from './shared-corners.ts';

declare module 'three' {
  interface Material<TEventMap extends MaterialEventMap = MaterialEventMap> {
    /**
     * The serial number of the material in the order of creation. three.js sets it, and its render
     * list sorts the draws by it, but the types of three.js do not declare it.
     */
    readonly id: number;
  }
}

/**
 * Gives the program variant of a mesh (design 4.5): the parts of a mesh that select the shader
 * program of a material in three.js. These are the skin, the morph targets, and the attributes of
 * the geometry.
 *
 * three.js keeps one current program for each material. When meshes of two variants share a
 * material, each draw after a change of variant looks up the program again
 * (`WebGLRenderer.getProgram()`). The bodies have different counts of morph targets, so
 * one shared material looks up its program at about each player, in each pass of a frame: 1.1 ms
 * of main-thread time on the development Mac.
 *
 * @param mesh The mesh.
 * @returns A key that is the same for two meshes of one variant.
 */
function programVariant(mesh: Mesh): string {
  const geometry = mesh.geometry;
  const morphs = geometry.morphAttributes;
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}${attribute.itemSize}`)
    .toSorted()
    .join(',');
  return [
    mesh instanceof SkinnedMesh ? 'skin' : 'rigid',
    morphs['position']?.length ?? 0,
    morphs['normal']?.length ?? 0,
    morphs['color']?.length ?? 0,
    attributes,
  ].join(':');
}

/**
 * Tells if an object draws into the depth passes of a frame: a mesh whose materials each write
 * depth. The light effects write no depth, and the depth passes hide them.
 *
 * @param object The object.
 * @returns True for such a mesh.
 */
function writesDepth(object: Object3D): object is Mesh {
  if (!(object instanceof Mesh)) {
    return false;
  }
  const own: readonly Material[] = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return own.every((material) => material.depthWrite);
}

/** A mesh of a depth pass, and its depth material in the form of its own material. */
interface DepthMesh {
  readonly mesh: Mesh;
  /** The depth material of the variant of the mesh. */
  readonly depth: MeshBasicMaterial;
  /** The depth geometry of the mesh (`depthGeometryOf()`), or `null` to keep its geometry. */
  readonly geometry: BufferGeometry | null;
  /** The own geometry of the mesh. */
  readonly full: BufferGeometry;
  /** The depth material once for each material of a mesh with a list of materials. */
  list: MeshBasicMaterial[];
}

/**
 * Gives a mesh of a depth pass with its depth material and its depth geometry.
 *
 * @param mesh The mesh.
 * @param depth The depth material of its variant.
 * @returns The entry.
 */
function depthMesh(mesh: Mesh, depth: MeshBasicMaterial): DepthMesh {
  return { mesh, depth, geometry: depthGeometryOf(mesh.geometry), full: mesh.geometry, list: [] };
}

/**
 * The materials of each program variant of the players (design 4.5): a copy of the shared material
 * for the scene pass, a depth material for the shadow maps, and a depth material for the depth
 * passes of the beam and of the depth of field. Each copy and each depth material keeps the
 * program of its variant, so no draw of a frame looks up a program again ({@link programVariant}).
 * The copies have the values, the textures, and the shader patch of the shared material, so they
 * use the same programs and give the same pixels.
 */
export class VariantMaterials {
  readonly #shared: readonly MeshStandardMaterial[];
  /** The copies of the shared material, by variant. */
  readonly #copies = new Map<string, MeshStandardMaterial[]>();
  /** The id of the shared material of each copy, for the order of the draws. */
  readonly #sharedIds = new WeakMap<Material, number>();
  /** The depth materials of the shadow maps, by variant. */
  readonly #shadows = new Map<string, MeshDepthMaterial>();
  /** The depth materials of the depth passes, by variant. */
  readonly #depths = new Map<string, MeshBasicMaterial>();
  /** The meshes of the depth passes of the current scene. */
  #depthMeshes: DepthMesh[] = [];
  /** The own material of each mesh of {@link VariantMaterials.renderDepth}, during the render. */
  readonly #own: (Material | Material[])[] = [];

  /**
   * Creates no material until a scene needs it.
   *
   * @param shared The shared material of the players and the props (`createMaterials()`).
   */
  constructor(shared: readonly MeshStandardMaterial[]) {
    this.#shared = shared;
  }

  /**
   * Sorts the opaque draws of a render as `painterSortStable()` of three.js does, with the id of
   * the shared material first: the props draw before the players. Then the players of one copy
   * draw together, by the distance from the camera, so that the scene pass changes its program
   * and uploads the uniforms of the material once for each variant in place of at about each
   * player. With the copies in the order of their ids before the props, two draws at one depth of
   * a sample of the scene target came in the other order, and 1 or 2 pixels of a frozen frame
   * changed by up to 14 of 255. The order of this sort gave the same pixels in the four frozen
   * shots.
   *
   * @param a A draw.
   * @param b Another draw.
   * @returns A negative number when `a` draws first.
   */
  readonly opaqueSort = (a: RenderItem, b: RenderItem): number => {
    if (a.groupOrder !== b.groupOrder) {
      return a.groupOrder - b.groupOrder;
    }
    if (a.renderOrder !== b.renderOrder) {
      return a.renderOrder - b.renderOrder;
    }
    const idA = this.#sharedIds.get(a.material) ?? a.material.id;
    const idB = this.#sharedIds.get(b.material) ?? b.material.id;
    if (idA !== idB) {
      return idA - idB;
    }
    if (a.material.id !== b.material.id) {
      return a.material.id - b.material.id;
    }
    if (a.materialVariant !== b.materialVariant) {
      return a.materialVariant - b.materialVariant;
    }
    if (a.z !== b.z) {
      return a.z - b.z;
    }
    return a.id - b.id;
  };

  /** Each copy of the shared material, which the next scene can reuse. */
  get copies(): MeshStandardMaterial[] {
    return [...this.#copies.values()].flat();
  }

  /**
   * Gives each player mesh the copy of its material for its variant, and the depth material of
   * its variant for the shadow maps (`customDepthMaterial`). The shadow pass of three.js copies
   * the side and the other values of the material of each draw to it, as to its own depth
   * material.
   *
   * @param meshes The player meshes. Each one has the shared material, or its copy with the color
   *   map of the body (`bodyMapMaterial()`).
   */
  assign(meshes: readonly Mesh[]): void {
    for (const mesh of meshes) {
      const own = this.#ownOf(mesh);
      const variant = `${programVariant(mesh)}:${own.map((material) => material.id).join(',')}`;
      let copies = this.#copies.get(variant);
      if (!copies) {
        copies = own.map((material) => {
          const copy = material.clone();
          // The patch of `createMaterials()` is an arrow function that reads no `this`. The copy
          // keeps the same function, so its program key (the source text of the patch) is the key
          // of the shared material, and it takes the compiled program of the shared material. The
          // copy also keeps the program key and the draw hook of a material with a color map.
          // oxlint-disable-next-line typescript/unbound-method -- see the comment above.
          copy.onBeforeCompile = material.onBeforeCompile;
          // oxlint-disable-next-line typescript/unbound-method -- see the comment above.
          copy.customProgramCacheKey = material.customProgramCacheKey;
          // oxlint-disable-next-line typescript/unbound-method -- see the comment above.
          copy.onBeforeRender = material.onBeforeRender;
          this.#sharedIds.set(copy, material.id);
          return copy;
        });
        this.#copies.set(variant, copies);
      }
      mesh.material = [...copies];
      let shadow = this.#shadows.get(variant);
      if (!shadow) {
        shadow = new MeshDepthMaterial();
        this.#shadows.set(variant, shadow);
      }
      mesh.customDepthMaterial = shadow;
    }
  }

  /**
   * Gives the materials of a player mesh: its own materials, or the shared material when one of
   * them is not a standard material.
   *
   * @param mesh The player mesh.
   * @returns The materials.
   */
  #ownOf(mesh: Mesh): readonly MeshStandardMaterial[] {
    const own: readonly Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const standard = own.filter((material) => material instanceof MeshStandardMaterial);
    return standard.length === own.length ? standard : this.#shared;
  }

  /**
   * Finds the meshes of the depth passes of a scene: each mesh whose materials write depth.
   *
   * @param scene The scene of the layout.
   */
  useScene(scene: Object3D): void {
    const meshes: DepthMesh[] = [];
    scene.traverse((object) => {
      if (writesDepth(object)) {
        meshes.push(depthMesh(object, this.#depthOf(object)));
      }
    });
    this.#depthMeshes = meshes;
  }

  /**
   * Draws a depth pass with the depth material of the variant of each mesh in place of its own
   * material, as `Scene.overrideMaterial` does with one material for all meshes. A mesh with a
   * list of materials gets the depth material once for each, so each group draws as before. The
   * depth material writes no color, and the order of the draws does not change a depth.
   *
   * @param draw Renders the scene.
   */
  renderDepth(draw: () => void): void {
    this.#swapDepth(this.#depthMeshes, this.#own, draw);
  }

  /**
   * Runs a draw with the depth material of the variant of each mesh of an object in place of its
   * own material, as {@link VariantMaterials.renderDepth} does for the meshes of the current
   * scene. The build of a new scene compiles the programs of its depth passes with it (design
   * 7.2).
   *
   * @param object The object. Its meshes that write depth get their depth materials.
   * @param draw Compiles or renders the object.
   */
  renderDepthOf(object: Object3D, draw: () => void): void {
    const meshes: DepthMesh[] = [];
    object.traverse((child) => {
      if (writesDepth(child)) {
        meshes.push(depthMesh(child, this.#depthOf(child)));
      }
    });
    this.#swapDepth(meshes, [], draw);
  }

  /**
   * Runs a draw with the depth materials of some meshes in place of their own materials, and
   * gives the meshes their own materials back after it.
   *
   * @param meshes The meshes and their depth materials.
   * @param own The list that keeps the own material of each mesh during the draw.
   * @param draw Renders or compiles.
   */
  #swapDepth(meshes: readonly DepthMesh[], own: (Material | Material[])[], draw: () => void): void {
    own.length = 0;
    for (const entry of meshes) {
      const material = entry.mesh.material;
      own.push(material);
      if (entry.geometry) {
        entry.mesh.geometry = entry.geometry;
      }
      if (Array.isArray(material)) {
        if (entry.list.length !== material.length) {
          entry.list = material.map(() => entry.depth);
        }
        entry.mesh.material = entry.list;
      } else {
        entry.mesh.material = entry.depth;
      }
    }
    try {
      draw();
    } finally {
      for (const [i, entry] of meshes.entries()) {
        const material = own[i];
        if (material) {
          entry.mesh.material = material;
        }
        if (entry.geometry) {
          entry.mesh.geometry = entry.full;
        }
      }
      own.length = 0;
    }
  }

  /**
   * Gives the depth material of the variant of a mesh: it writes no color, as the material of
   * the depth passes of the beam and of the depth of field before this cut.
   *
   * @param mesh The mesh.
   * @returns The material.
   */
  #depthOf(mesh: Mesh): MeshBasicMaterial {
    const variant = programVariant(mesh);
    let material = this.#depths.get(variant);
    if (!material) {
      material = new MeshBasicMaterial({ colorWrite: false });
      this.#depths.set(variant, material);
    }
    return material;
  }
}
