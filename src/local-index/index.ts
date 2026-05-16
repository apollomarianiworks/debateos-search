export type { IndexedDocument, LocalIndexStorage, LocalIndexStats } from "./types";
export {
  upsertDocument,
  listDocuments,
  getDocument,
  removeDocument,
  removeDocumentsBySource,
  clearAll as clearLocalIndex,
  getStats,
  hasDocuments,
} from "./localIndex";
export { tokenize, termFrequency } from "./tokenizer";
export { searchLocalIndex } from "./searchLocalIndex";
export { LocalIndexProvider } from "./LocalIndexProvider";
