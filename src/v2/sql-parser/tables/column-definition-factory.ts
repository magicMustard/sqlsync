import { ColumnDefinition } from './types';

export class ColumnDefinitionFactory {
	private name: string = '';
	private dataType: string = '';
	private isNullable: boolean = true;
	private defaultValue: string | number | null = null;
	private isPrimaryKey: boolean = false;
	private isUnique: boolean = false;
	private foreignKey:
		| {
				referencedTable: string;
				referencedColumn: string;
				onDelete?: string;
				onUpdate?: string;
		}
		| undefined = undefined;
	private checkConstraint: string | undefined = undefined;

	constructor(columnString: string) {
		this.parseColumn(columnString);
	}

	private parseColumn(columnString: string): void {
		// Skip empty or constraint-only lines (basic check)
		if (
			!columnString ||
			columnString.match(/^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK)/i)
		) {
			return;
		}

		// Basic column parsing for name and type
		const colParts = columnString.split(' ');
		if (colParts.length < 2) {
			return; // Skip malformed column definitions
		}

		this.name = colParts[0];
		this.dataType = colParts[1];

		// Parse attributes
		this.parseNullable(columnString);
		this.parseDefaultValue(columnString);
		this.parsePrimaryKey(columnString);
		this.parseUnique(columnString);
		this.parseForeignKey(columnString);
		this.parseCheckConstraint(columnString);
	}

	private parseNullable(columnString: string): void {
		const remainingParts = columnString.toUpperCase();
		if (remainingParts.includes('NOT NULL')) {
			this.isNullable = false;
		}
	}

	private parseDefaultValue(columnString: string): void {
		const defaultMatch = columnString.match(/DEFAULT\s+([^,\s]+)/i);
		if (defaultMatch) {
			this.defaultValue = defaultMatch[1];
		}
	}

	private parsePrimaryKey(columnString: string): void {
		const remainingParts = columnString.toUpperCase();
		if (remainingParts.includes('PRIMARY KEY')) {
			this.isPrimaryKey = true;
		}
	}

	private parseUnique(columnString: string): void {
		const remainingParts = columnString.toUpperCase();
		if (
			remainingParts.includes('UNIQUE') &&
			!remainingParts.includes('UNIQUE KEY')
		) {
			this.isUnique = true;
		}
	}

	private parseForeignKey(columnString: string): void {
		const remainingParts = columnString.toUpperCase();
		if (remainingParts.includes('FOREIGN KEY')) {
			this.foreignKey = { referencedTable: '', referencedColumn: '' }; // Placeholder, can be enhanced
		}
	}

	private parseCheckConstraint(columnString: string): void {
		const checkMatch = columnString.match(/CHECK\s*\(([^)]+)\)/i);
		if (checkMatch) {
			this.checkConstraint = checkMatch[1];
		}
	}

	public getColumnDefinition(): ColumnDefinition {
		return {
			name: this.name,
			dataType: this.dataType,
			isNullable: this.isNullable,
			defaultValue: this.defaultValue,
			isPrimaryKey: this.isPrimaryKey,
			isUnique: this.isUnique,
			foreignKey: this.foreignKey,
			checkConstraint: this.checkConstraint,
		};
	}
}
