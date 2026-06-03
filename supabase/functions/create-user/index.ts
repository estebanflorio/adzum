import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Cliente con service role (solo disponible en Edge Functions)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Cliente del usuario que hace la llamada (para verificar su rol)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    // Verificar que el llamante es director o admin
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: callerProfile } = await supabaseAdmin.from('users').select('rol, school_id').eq('id', caller.id).single()
    if (!callerProfile || !['director', 'admin'].includes(callerProfile.rol)) {
      return new Response(JSON.stringify({ error: 'Solo directoras o admins pueden crear usuarios' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { email, password, nombre, apellido, rol } = await req.json()

    if (!email || !password || !nombre || !apellido || !rol) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Crear usuario en Auth
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) throw createErr

    // Crear perfil en tabla users
    const { error: profileErr } = await supabaseAdmin.from('users').insert({
      id:        authData.user.id,
      school_id: callerProfile.school_id,
      nombre,
      apellido,
      email,
      rol,
      activo: true,
    })
    if (profileErr) {
      // Rollback: borrar el usuario de auth si falla el perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw profileErr
    }

    return new Response(JSON.stringify({ ok: true, userId: authData.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})