# SQLSync Changelog

## v0.1.2 - 2025-04-05

### Added
- SQL normalization feature to prevent unnecessary migrations for comment and whitespace changes
- Added `normalizeSQL` function to strip comments and standardize whitespace in SQL content
- Added `normalizedChecksum` field to track checksums of normalized SQL content
- Added validation to ensure migrations have actual SQL content before generation

### Changed
- Updated SQL processor to calculate both raw and normalized checksums during file processing
- Enhanced diff engine to use normalized checksums for detecting meaningful changes
- Fixed file encoding format consistency ('utf-8' vs 'utf8')

### Fixed
- SQLSync no longer generates migration files when only comments or whitespace have changed
- Improved test suite to validate proper handling of non-functional SQL changes

## v0.1.1 - 2025-04-01

### Added
- Initial release of SQLSync
- Declarative table management
- Statement splitting
- Directory structure support
- Multi-developer collaboration
- Safety-first migrations
- Rollback support
