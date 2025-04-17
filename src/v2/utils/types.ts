import { Command } from "commander";

export type Notice = "debug" | "info" | "warn" | "error" | "success";

export interface notices {
	level: Notice;
	message: string;
}

export interface Context {
	command: Command;
	notices: notices[];
}