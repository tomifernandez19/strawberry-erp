import { NextResponse } from 'next/server';
import { getMlAuthUrl } from '@/lib/mercadolibre';

export async function GET() {
    const url = getMlAuthUrl();
    return NextResponse.redirect(url);
}
