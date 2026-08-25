/**
 * Type aliases for TSL nodes.
 *
 * three.js does not re-export its node type from `three/tsl`, and the shading
 * code needs to name the type of a shader value in a function signature. This is
 * the one place that reaches into `three/src`.
 */
import type NodeType from 'three/src/nodes/core/Node.js'

export type TslNode<T extends string = string> = NodeType<T>
export type Float = TslNode<'float'>
export type Vec2 = TslNode<'vec2'>
export type Vec3 = TslNode<'vec3'>
export type Vec4 = TslNode<'vec4'>
