'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { PermissionGuard } from '@/shared/components/PermissionGuard';
import { ProductEditForm } from '@/modules/product/components/ProductEditForm';

export default function ProductEditPage() {
  const params = useParams();
  const productId = params.id as string;

  return (
    <PermissionGuard permissionKey="inventory:edit" redirect>
      <ProductEditForm productId={productId} />
    </PermissionGuard>
  );
}
