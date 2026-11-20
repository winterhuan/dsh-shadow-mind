export const en = {
    title: 'Shadow Mind', description: 'Configure independent reviews and inspect their activity for this Session.',
    active: 'Active', paused: 'Paused', unavailable: 'This plugin is not loaded, so its settings are unavailable.',
    connectionError: 'Shadow status could not be refreshed.', activeRuns: 'Active runs', configuredShadows: 'Responsibilities',
    recordedEvents: 'Recorded events', diagnostics: 'Diagnostics', noAgent: 'No active Agent for this Session.',
    heartbeatProbability: 'Heartbeat probability', heartbeatTools: 'Heartbeat tool names', maxParallel: 'Maximum parallel runs',
    timeoutSeconds: 'Default timeout (seconds)', resultBatchWindowMs: 'Report batch window (ms)',
    maxHeartbeatRunsPerTask: 'Heartbeat runs per task', defaultShadowModel: 'Default model (provider/model)',
    defaultThinkingLevel: 'Default thinking level', overridden: 'Overridden', reset: 'Reset to default',
    readOnly: 'This deployment stores settings read-only.', save: 'Save', saving: 'Saving…',
    saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
    invalidNumber: 'Enter a valid number, or leave blank to use the default.',
};
export const zh = {
    title: 'Shadow Mind', description: '配置独立审查，并查看当前会话的运行情况。',
    active: '运行中', paused: '已暂停', unavailable: '插件未加载，当前无法配置。',
    connectionError: '无法刷新 Shadow 状态。', activeRuns: '运行任务', configuredShadows: '职责数',
    recordedEvents: '已记录事件', diagnostics: '诊断', noAgent: '当前会话没有运行中的 Agent。',
    heartbeatProbability: '心跳触发概率', heartbeatTools: '心跳工具名称', maxParallel: '最大并行运行数',
    timeoutSeconds: '默认超时（秒）', resultBatchWindowMs: '报告合并窗口（毫秒）',
    maxHeartbeatRunsPerTask: '每项任务心跳运行上限', defaultShadowModel: '默认模型（provider/model）',
    defaultThinkingLevel: '默认思考级别', overridden: '已覆盖', reset: '恢复默认',
    readOnly: '本部署的设置为只读。', save: '保存', saving: '保存中…',
    saveFailed: '本部署未接受这些值，草稿已保留供修改。', invalidNumber: '请输入有效数字；留空表示恢复默认值。',
};
export function formLabels(t) {
    return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') };
}
//# sourceMappingURL=locales.js.map