export { useAlternatives, type AlternativesInput } from './api/use-alternatives.js';
export { AlternativeCard, type AlternativeCardProps } from './components/AlternativeCard.js';
export { ComparisonTable, type ComparisonTableProps } from './components/ComparisonTable.js';
export {
  buildComparison,
  markBest,
  MAX_COMPARED,
  type ComparisonCell,
  type ComparisonRow,
  type ComparisonTable as ComparisonTableModel,
} from './model/comparison.js';
