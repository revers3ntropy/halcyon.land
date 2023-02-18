import type { Handle } from "@sveltejs/kit";

process.on("SIGINT", process.exit);
process.on("SIGTERM", process.exit);

export const ssr = false;
export const prerender = false;

export const handle: Handle = async ({ event, resolve }) => {
    return resolve(event);
};

export {};
