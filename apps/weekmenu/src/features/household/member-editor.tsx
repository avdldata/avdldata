'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MemberForm } from './member-form';
import { deleteMemberAction, saveMemberAction } from './actions';
import type { MemberFormValues } from './schema';

export function MemberEditor({
  defaultValues,
  canDelete,
}: {
  defaultValues?: MemberFormValues;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <MemberForm
        {...(defaultValues ? { defaultValues } : {})}
        submitLabel="Opslaan"
        onSubmit={async (values) => {
          const result = await saveMemberAction(values);
          if (result.ok) {
            router.push('/gezin');
            router.refresh();
          }
          return result;
        }}
      />

      {canDelete && defaultValues?.id ? (
        <div className="border-t border-line pt-5">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const result = await deleteMemberAction(defaultValues.id!);
                if (!result.ok) {
                  setError(result.error ?? 'Verwijderen is niet gelukt.');
                  return;
                }
                router.push('/gezin');
                router.refresh();
              });
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Dit gezinslid verwijderen
          </Button>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
