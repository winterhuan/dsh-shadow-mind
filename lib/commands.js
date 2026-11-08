import { CommandDefinitionId } from '@deepseek-ai/dsh-commands';
export const name = 'shadow-mind-commands';
export const inject = ['commands', 'shadowMind'];
/**
 * Register manual checks, pause, resume, and status without adding model tools.
 * @param ctx - Plugin context owning the command registration.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.commands.register({ definitionId: CommandDefinitionId('dsh-shadow-mind/shadow'), name: 'shadow',
        description: 'inspect and control independent read-only reviews', input: { hint: 'status | check [id] | pause | resume' },
        async handler({ agent, rawInput, signal }) {
            const [action = 'status', id, ...rest] = rawInput.trim().split(/\s+/u).filter(Boolean);
            if (rest.length > 0 || (action !== 'check' && id !== undefined))
                return { kind: 'error', text: 'Usage: /shadow status | check [id] | pause | resume' };
            if (action === 'status')
                return { kind: 'success', text: await ctx.shadowMind.status(agent) };
            if (action === 'pause' || action === 'resume') {
                await ctx.shadowMind.pause(agent, action === 'pause');
                return { kind: 'success', text: action === 'pause' ? 'Shadow Mind paused; active reviews stopped.' : 'Shadow Mind resumed for future reviews.' };
            }
            if (action === 'check') {
                await ctx.shadowMind.review(agent, signal, id);
                return { kind: 'success', text: await ctx.shadowMind.status(agent) };
            }
            return { kind: 'error', text: 'Usage: /shadow status | check [id] | pause | resume' };
        },
    }));
}
