import * as fs from 'fs';
import { SqlFileDetails } from './types';

/**
 * SqlFiles manages the ordered traversal of SQL files based on the structure provided by FileLoader.
 * It provides a 'next()' method to retrieve the next file in the specified order.
 */
export class SqlFiles {
	private currentCategory: string | null = null;
	private currentIndex: number = 0;
	private currentSubIndex: number = 0;
	private categories: string[] = [];

	constructor(public readonly schemaStructure: Record<string, any>) {
		this.categories = Object.keys(this.schemaStructure).filter(
			(key) =>
				this.schemaStructure[key] &&
				typeof this.schemaStructure[key] === 'object' &&
				'order' in this.schemaStructure[key]
		);
		if (this.categories.length > 0) {
			this.currentCategory = this.categories[0];
		} else {
			this.currentCategory = null;
		}
		this.currentIndex = 0;
	}

	/**
	 * Retrieves the next file in the ordered structure.
	 * @returns SqlFileDetails of the next file, or null if there are no more files.
	 */
	public next(): SqlFileDetails | null {
		while (this.currentCategory) {
			const categoryData = this.schemaStructure[this.currentCategory];
			const orderList = categoryData.order as string[];

			if (this.currentIndex >= orderList.length) {
				// Move to the next category
				const nextCategoryIndex =
					this.categories.indexOf(this.currentCategory) + 1;
				if (nextCategoryIndex < this.categories.length) {
					this.currentCategory = this.categories[nextCategoryIndex];
					this.currentIndex = 0;
					this.currentSubIndex = 0;
				} else {
					this.currentCategory = null;
					return null;
				}
				continue;
			}

			const currentItemPath = orderList[this.currentIndex];
			const stat = fs.statSync(currentItemPath);

			if (stat.isFile() && currentItemPath.endsWith('.sql')) {
				// Direct file, return its details
				const fileDetails: SqlFileDetails = {
					location: currentItemPath,
					contents: fs.readFileSync(currentItemPath, 'utf8'),
				};
				this.currentIndex++;
				return fileDetails;
			} else if (stat.isDirectory()) {
				// Directory, process orderedSubdirectoryFileOrder if available
				const subOrder =
					(categoryData.orderedSubdirectoryFileOrder as string[]) || [];
				while (this.currentSubIndex < subOrder.length) {
					const subItem = subOrder[this.currentSubIndex];
					const subItemPath = `${currentItemPath}/${subItem}`;
					if (
						fs.existsSync(subItemPath) &&
						fs.statSync(subItemPath).isFile() &&
						subItemPath.endsWith('.sql')
					) {
						const subFileDetails: SqlFileDetails = {
							location: subItemPath,
							contents: fs.readFileSync(subItemPath, 'utf8'),
						};
						this.currentSubIndex++;
						return subFileDetails;
					}
					this.currentSubIndex++;
				}
				// No more sub-items or no matching files, move to next main item
				this.currentIndex++;
				this.currentSubIndex = 0;
				continue; // Ensure we continue to the next item in the loop
			}
		}

		return null;
	}
}
