import ChatInterface from "../../components/ChatInterface";
import { PageHeader } from "../../components/ui";
export default function MessageParent() {
  return (
    <>
      <PageHeader
        title="Message Parents"
        subtitle="Communicate directly with the families in your class."
      />
      <ChatInterface currentUserRole="teacher" />
    </>
  );
}
