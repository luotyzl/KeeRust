import { useModals, closeXmlModal } from "../../stores/modals";
import { copyText } from "../../stores/toast";

export default function XmlModal() {
  const visible = useModals((s) => s.xmlVisible);
  const content = useModals((s) => s.xmlContent);

  if (!visible) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && closeXmlModal()}
    >
      <div className="modal-box modal-xml">
        <div className="modal-title">Entry XML</div>
        <pre>{content}</pre>
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={() => copyText(content, "XML")}>
            Copy
          </button>
          <button className="btn-modal-cancel" onClick={closeXmlModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
