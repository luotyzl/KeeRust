import { createStore } from "../lib/store";
import type { EntryData } from "../types";

export type CreateKind = "entry" | "group";

interface ModalState {
  deleteVisible: boolean;
  deleteEntry: EntryData | null;
  deletePermanent: boolean;
  xmlVisible: boolean;
  xmlContent: string;
  createVisible: boolean;
  createKind: CreateKind;
  // When set, the create-entry dialog opens in edit mode for this entry.
  createEntry: EntryData | null;
}

export const modalStore = createStore<ModalState>({
  deleteVisible: false,
  deleteEntry: null,
  deletePermanent: false,
  xmlVisible: false,
  xmlContent: "",
  createVisible: false,
  createKind: "entry",
  createEntry: null,
});

export const useModals = modalStore.use;

export function openCreateModal(kind: CreateKind): void {
  modalStore.setState({ createKind: kind, createEntry: null, createVisible: true });
}

// Open the entry dialog pre-filled to edit an existing entry.
export function openEditEntryModal(entry: EntryData): void {
  modalStore.setState({ createKind: "entry", createEntry: entry, createVisible: true });
}

export function closeCreateModal(): void {
  modalStore.setState({ createVisible: false });
}

export function openDeleteModal(entry: EntryData, permanent: boolean): void {
  modalStore.setState({
    deleteEntry: entry,
    deletePermanent: permanent,
    deleteVisible: true,
  });
}

export function closeDeleteModal(): void {
  modalStore.setState({ deleteVisible: false, deleteEntry: null });
}

export function openXmlModal(content: string): void {
  modalStore.setState({ xmlContent: content, xmlVisible: true });
}

export function closeXmlModal(): void {
  modalStore.setState({ xmlVisible: false });
}
