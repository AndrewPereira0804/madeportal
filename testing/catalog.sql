with objects as (
select 'relation' kind,n.nspname||'.'||c.relname name,jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'owner',pg_get_userbyid(c.relowner),'definition',case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) else null end) definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
union all
select 'column',n.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m')
union all
select 'constraint',n.nspname||'.'||c.relname||'.'||t.conname,to_jsonb(pg_get_constraintdef(t.oid,true)) from pg_constraint t join pg_class c on c.oid=t.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
union all
select 'index',schemaname||'.'||indexname,to_jsonb(indexdef) from pg_indexes where schemaname in ('public','private')
union all
select 'policy',schemaname||'.'||tablename||'.'||policyname,jsonb_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'using',qual,'check',with_check) from pg_policies where schemaname in ('public','private','storage')
union all
select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,'acl',p.proacl::text)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p') and not exists(select 1 from pg_depend dep where dep.classid='pg_proc'::regclass and dep.objid=p.oid and dep.deptype='e')
union all
select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private','auth')
union all
select 'table_grant',table_schema||'.'||table_name||'.'||grantee||'.'||privilege_type,to_jsonb(is_grantable) from information_schema.role_table_grants where table_schema in ('public','private')
union all
select 'column_grant',table_schema||'.'||table_name||'.'||column_name||'.'||grantee||'.'||privilege_type,to_jsonb(is_grantable) from information_schema.role_column_grants where table_schema in ('public','private')
union all
select 'schema_acl',nspname,jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text) from pg_namespace where nspname in ('public','private')
union all
select 'default_acl',coalesce(n.nspname,'*')||'.'||pg_get_userbyid(d.defaclrole)||'.'||d.defaclobjtype::text,to_jsonb(d.defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','private') or d.defaclnamespace=0
union all
select 'enum',n.nspname||'.'||t.typname,jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','private') group by n.nspname,t.typname
union all
select 'extension',e.extname,jsonb_build_object('version',e.extversion,'schema',n.nspname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace
)
select kind,name,definition from objects order by kind,name;
