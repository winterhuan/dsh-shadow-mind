export function matchesModel(definition, mainModel) {
    const values = definition.activeForModels.map(value => value.trim()).filter(Boolean);
    const negative = values.filter(value => value.startsWith('!')).map(value => value.slice(1));
    const positive = values.filter(value => !value.startsWith('!'));
    if (negative.some(pattern => modelMatches(pattern, mainModel)))
        return false;
    return positive.length === 0 ? negative.length > 0 : positive.some(pattern => modelMatches(pattern, mainModel));
}
function modelMatches(pattern, fullId) {
    if (pattern === '*')
        return true;
    const modelId = fullId.includes('/') ? fullId.slice(fullId.indexOf('/') + 1) : fullId;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const expression = new RegExp(`^${escaped}$`, 'u');
    return expression.test(fullId) || (!pattern.includes('/') && expression.test(modelId));
}
export function decideHeartbeat(options) {
    const heartbeatRoll = options.random();
    const empty = { activated: [], candidates: [], modelFiltered: [], runningExcluded: [], toolFiltered: [], roundFiltered: [] };
    if (heartbeatRoll >= options.heartbeatProbability || options.availableSlots <= 0)
        return { heartbeatRoll, ...empty };
    if (options.heartbeatTools.length && !options.heartbeatTools.some(name => options.executedTools.includes(name)))
        return {
            heartbeatRoll, ...empty,
            toolFiltered: options.definitions.filter(definition => definition.enabled && definition.triggers.includes('heartbeat')).map(({ id }) => id),
        };
    const modelFiltered = [];
    const runningExcluded = [];
    const toolFiltered = [];
    const eligible = options.definitions.filter(definition => {
        if (!definition.enabled || !definition.triggers.includes('heartbeat'))
            return false;
        if (options.active.has(definition.id)) {
            runningExcluded.push(definition.id);
            return false;
        }
        if (!matchesModel(definition, options.mainModel)) {
            modelFiltered.push(definition.id);
            return false;
        }
        if (definition.activationTools.length && !definition.activationTools.some(name => options.executedTools.includes(name))) {
            toolFiltered.push(definition.id);
            return false;
        }
        return true;
    }).map(definition => ({ definition, roll: options.random() }));
    const hits = eligible.filter(item => item.roll < item.definition.probability);
    const activated = sample(hits, Math.min(options.availableSlots, hits.length), options.random);
    const selected = new Set(activated.map(item => item.definition.id));
    return { heartbeatRoll, activated, candidates: eligible.map(({ definition, roll }) => ({ id: definition.id, roll, selected: selected.has(definition.id) })),
        modelFiltered, runningExcluded, toolFiltered, roundFiltered: [] };
}
export function decideFinalResponse(options) {
    const modelFiltered = [];
    const runningExcluded = [];
    const roundFiltered = [];
    const activated = [];
    for (const definition of options.definitions) {
        if (!definition.enabled || !definition.triggers.includes('final_response'))
            continue;
        if (!matchesModel(definition, options.mainModel)) {
            modelFiltered.push(definition.id);
            continue;
        }
        if (options.active.has(definition.id)) {
            runningExcluded.push(definition.id);
            continue;
        }
        if (definition.finalResponseRounds > 0 && (options.rounds.get(definition.id) ?? 0) >= definition.finalResponseRounds) {
            roundFiltered.push(definition.id);
            continue;
        }
        activated.push({ definition, roll: 0 });
    }
    return { activated, candidates: activated.map(({ definition }) => ({ id: definition.id, roll: 0, selected: true })),
        modelFiltered, runningExcluded, toolFiltered: [], roundFiltered };
}
function sample(values, count, random) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy.slice(0, count);
}
//# sourceMappingURL=scheduler.js.map