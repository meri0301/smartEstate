// The presets lint themselves with the Node preset (plain JS, no type information).
import { node } from './node.js';

export default node({ tsconfigRootDir: import.meta.dirname });
