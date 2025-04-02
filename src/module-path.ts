// Module path resolution for TypeScript path aliases
import * as path from 'path';
import moduleAlias from 'module-alias';

// Add the base directory for module resolution
const baseDir = path.resolve(__dirname);
moduleAlias.addAliases({
	'@': baseDir
});
