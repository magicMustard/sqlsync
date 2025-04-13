import { SqlContent } from '../sql-parser/types';
import { StateContent } from '../state/types';

/**
 * Interface representing the details of a SQL file.
 */
export interface SqlFileDetails {
	location: string;
	contents: SqlContent;
}

/**
 * Interface representing the sql sync state file.
 * Kept simple as it'll be passed to the state manager
 * to convert to JSON and do what it wants.
 */
export interface StateFileDetails {
	fileExists: boolean;
	contents: StateContent;
}
