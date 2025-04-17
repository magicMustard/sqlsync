export interface MigrationItem {
	filePath: string;
	sql: string;
	checksum: string;
}