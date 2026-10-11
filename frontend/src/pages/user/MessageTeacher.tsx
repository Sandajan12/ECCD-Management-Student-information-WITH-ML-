import ChatInterface from "../../components/ChatInterface";
import { PageHeader } from "../../components/ui";
export default function MessageTeacher() {
  return (
    <>
      <PageHeader
        title="Message Teacher"
        subtitle="Stay in touch with your child’s adviser."
      />
      <ChatInterface currentUserRole="parent" />
    </>
  );
}
