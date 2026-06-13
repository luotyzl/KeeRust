import { useToast } from "../stores/toast";

export default function Toast() {
  const message = useToast((s) => s.message);
  const visible = useToast((s) => s.visible);
  return <div className={"copied-toast" + (visible ? " show" : "")}>{message}</div>;
}
