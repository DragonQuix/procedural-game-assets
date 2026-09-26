/**
 * examples/faults/shared-ember-data.mjs — 故障示例共用的英雄数据（只保留必要帧）
 * 与 examples/recipes/ember.mjs 同源的精简子集，避免故障资产与兼容样本混淆。
 */
import ember from '../recipes/ember.mjs';

export default {
  kind: 'humanoid',
  id: 'fault-base',
  seed: 0,
  palette: ember.palette,
  art: ember.art,
  frame: ember.frame,
  rig: ember.rig,
  poses: [],
  clips: {},
};
