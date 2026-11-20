import { CommandDefinitionId } from "@deepseek-ai/dsh-commands";
// lib/types/commands.js
const name = "shadow-mind-commands";
const inject = ["commands", "shadowMind"];
/**
* Register the original human controls while the runtime owns scheduling.
* @param ctx - Plugin context owning the command registration.
*/
function apply(ctx) {
	ctx.effect(() => ctx.commands.register({
		definitionId: CommandDefinitionId("dsh-shadow-mind/shadow"),
		name: "shadow",
		description: "inspect and control independent Shadow reviews and workers",
		input: { hint: "status | check [id] | probe [id] [tools] | list | clean | auto on|off | pause | resume" },
		async handler({ agent, rawInput, signal }) {
			const [action = "status", id, tools, ...rest] = rawInput.trim().split(/\s+/u).filter(Boolean);
			const usage = "Usage: /shadow status | check [id] | probe [id] [tools,...] | list | clean | auto on|off | pause | resume";
			if (rest.length > 0) return {
				kind: "error",
				text: usage
			};
			if (action === "status") return {
				kind: "success",
				text: await ctx.shadowMind.status(agent)
			};
			if (action === "list") return {
				kind: "success",
				text: await ctx.shadowMind.manage(agent, "list")
			};
			if (action === "clean") return {
				kind: "success",
				text: await ctx.shadowMind.clean(agent)
			};
			if (action === "auto") {
				if (id !== "on" && id !== "off") return {
					kind: "error",
					text: usage
				};
				return {
					kind: "success",
					text: ctx.shadowMind.setAuto(id === "on")
				};
			}
			if (action === "pause" || action === "resume") {
				if (id !== void 0) return {
					kind: "error",
					text: usage
				};
				await ctx.shadowMind.pause(agent, action === "pause");
				return {
					kind: "success",
					text: action === "pause" ? "Shadow Mind paused; active reviews stopped." : "Shadow Mind resumed for future reviews."
				};
			}
			if (action === "check") {
				if (tools !== void 0) return {
					kind: "error",
					text: usage
				};
				await ctx.shadowMind.review(agent, signal, id);
				return {
					kind: "success",
					text: await ctx.shadowMind.status(agent)
				};
			}
			if (action === "probe") {
				const requested = tools?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
				return {
					kind: "success",
					text: await ctx.shadowMind.probe(agent, signal, id, requested)
				};
			}
			return {
				kind: "error",
				text: usage
			};
		}
	}));
}
export { apply, inject, name };
