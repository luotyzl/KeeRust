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
}

export const modalStore = createStore<ModalState>({
  deleteVisible: false,
  deleteEntry: null,
  deletePermanent: false,
  xmlVisible: false,
  xmlContent: "",
  createVisible: false,
  createKind: "entry",
});

export const useModals = modalStore.use;

export function openCreateModal(kind: CreateKind): void {
  modalStore.setState({ createKind: kind, createVisible: true });
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
