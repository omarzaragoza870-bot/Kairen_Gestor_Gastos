-- Actualiza el ícono de las categorías por defecto que ya tenías creadas
-- (las que se sembraron antes de este fix, todas con el ícono genérico 🏷️)

update public.categorias set icono = '🍔' where nombre = 'Alimentación' and tipo = 'gasto';
update public.categorias set icono = '🚗' where nombre = 'Transporte' and tipo = 'gasto';
update public.categorias set icono = '💡' where nombre = 'Servicios' and tipo = 'gasto';
update public.categorias set icono = '🎬' where nombre = 'Entretenimiento' and tipo = 'gasto';
update public.categorias set icono = '👕' where nombre = 'Ropa' and tipo = 'gasto';
update public.categorias set icono = '🏥' where nombre = 'Salud' and tipo = 'gasto';
update public.categorias set icono = '📦' where nombre = 'Otros' and tipo = 'gasto';

update public.categorias set icono = '💰' where nombre = 'Salario' and tipo = 'ingreso';
update public.categorias set icono = '📈' where nombre = 'Inversiones' and tipo = 'ingreso';
update public.categorias set icono = '💼' where nombre = 'Negocios' and tipo = 'ingreso';
update public.categorias set icono = '↩️' where nombre = 'Reembolsos' and tipo = 'ingreso';
update public.categorias set icono = '🎁' where nombre = 'Regalos' and tipo = 'ingreso';
update public.categorias set icono = '📦' where nombre = 'Otros' and tipo = 'ingreso';
