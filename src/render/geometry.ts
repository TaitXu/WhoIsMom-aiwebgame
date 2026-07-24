import * as THREE from "three";

export function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  result.deleteAttribute("normal");
  result.computeVertexNormals();
  return result;
}
