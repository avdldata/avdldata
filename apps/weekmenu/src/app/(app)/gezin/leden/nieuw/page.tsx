import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MemberEditor } from '@/features/household/member-editor';

export const metadata: Metadata = { title: 'Gezinslid toevoegen — Weekmenu' };

export default function NewMemberPage() {
  return (
    <>
      <PageHeader title="Gezinslid toevoegen" backHref="/gezin" />
      <Card>
        <CardContent className="pt-5">
          <MemberEditor />
        </CardContent>
      </Card>
    </>
  );
}
