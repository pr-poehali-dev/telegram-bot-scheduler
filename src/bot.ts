import { Telegraf, Context, session } from 'telegraf';
import { message } from 'telegraf/filters';

interface SessionData {
  phoneNumber: string | null;
  subscribedChats: string[];
  subscriptionEndDate: Date | null;
}

interface BotContext extends Context {
  session: SessionData;
}

const ADMIN_USER_ID = 123456789; // Замените на ваш Telegram ID
const token = '7543252541:AAFxRxyQC-PyZo5X_tgZE23HPC2Tv7CI49U';
const bot = new Telegraf<BotContext>(token);

// Подключаем middleware для сессий
bot.use(session({
  defaultSession: () => ({
    phoneNumber: null,
    subscribedChats: [],
    subscriptionEndDate: null
  })
}));

// Команда start
bot.start(async (ctx) => {
  await ctx.reply('Добро пожаловать в бота отложенной отправки сообщений!\n\n' +
    'Чтобы привязать номер телефона, используйте команду /register\n' +
    'Для отправки отложенного сообщения в группу, используйте команду /text в нужной группе');
});

// Команда help
bot.help(async (ctx) => {
  await ctx.reply('Доступные команды:\n' +
    '/register - Привязать номер телефона\n' +
    '/text [сообщение] [время в секундах] - Отправить отложенное сообщение\n' +
    '/status - Показать информацию о подписке\n' +
    '/chats - Показать список привязанных чатов');
});

// Команда register для привязки номера телефона
bot.command('register', async (ctx) => {
  await ctx.reply('Пожалуйста, поделитесь своим контактом, нажав на кнопку ниже', {
    reply_markup: {
      keyboard: [
        [{ text: 'Поделиться контактом', request_contact: true }]
      ],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });
});

// Обработка полученного контакта
bot.on(message('contact'), async (ctx) => {
  const contact = ctx.message.contact;
  
  if (contact && contact.user_id === ctx.from.id) {
    ctx.session.phoneNumber = contact.phone_number;
    await ctx.reply(`Ваш номер ${contact.phone_number} успешно привязан!`, {
      reply_markup: { remove_keyboard: true }
    });
  } else {
    await ctx.reply('Пожалуйста, отправьте свой собственный контакт', {
      reply_markup: { remove_keyboard: true }
    });
  }
});

// Команда text для отправки отложенного сообщения
bot.command('text', async (ctx) => {
  if (!ctx.session.phoneNumber) {
    return ctx.reply('Сначала привяжите номер телефона с помощью команды /register');
  }

  // Проверка на максимальное количество чатов для бесплатной версии
  const chatId = ctx.chat.id.toString();
  
  if (!ctx.session.subscribedChats.includes(chatId)) {
    if (ctx.session.subscribedChats.length >= 2 && !ctx.session.subscriptionEndDate) {
      return ctx.reply('В бесплатной версии вы можете использовать бота только в двух чатах. Обратитесь к администратору для получения подписки.');
    }
    
    ctx.session.subscribedChats.push(chatId);
    await ctx.reply('Чат добавлен в список доступных чатов!');
  }

  const text = ctx.message.text.split(' ');
  if (text.length < 3) {
    return ctx.reply('Пожалуйста, используйте формат: /text [сообщение] [время в секундах]');
  }

  const messageText = text.slice(1, -1).join(' ');
  const delaySeconds = parseInt(text[text.length - 1]);

  if (isNaN(delaySeconds) || delaySeconds <= 0) {
    return ctx.reply('Время должно быть положительным числом в секундах');
  }

  await ctx.reply(`Сообщение "${messageText}" будет отправлено через ${delaySeconds} секунд`);

  // Отправка отложенного сообщения
  setTimeout(async () => {
    try {
      await ctx.telegram.sendMessage(chatId, messageText);
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
    }
  }, delaySeconds * 1000);
});

// Команда status для проверки статуса подписки
bot.command('status', async (ctx) => {
  const subscriptionStatus = ctx.session.subscriptionEndDate 
    ? `Ваша подписка действует до: ${ctx.session.subscriptionEndDate.toLocaleDateString()}`
    : 'У вас бесплатная версия (ограничение: 2 чата)';
  
  await ctx.reply(`Статус вашей подписки:\n${subscriptionStatus}\n\nКоличество привязанных чатов: ${ctx.session.subscribedChats.length}`);
});

// Команда chats для просмотра привязанных чатов
bot.command('chats', async (ctx) => {
  if (ctx.session.subscribedChats.length === 0) {
    return ctx.reply('У вас нет привязанных чатов');
  }

  const chatsList = await Promise.all(ctx.session.subscribedChats.map(async (chatId, index) => {
    try {
      const chat = await ctx.telegram.getChat(chatId);
      return `${index + 1}. ${chat.title || chat.username || chatId}`;
    } catch (error) {
      return `${index + 1}. Чат ${chatId} (нет доступа)`;
    }
  }));

  await ctx.reply(`Ваши привязанные чаты:\n${chatsList.join('\n')}`);
});

// Команда add для администратора (выдача подписки)
bot.command('add', async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Эта команда доступна только администратору');
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('Используйте формат: /add [username] [days]');
  }

  const username = args[1].replace('@', '');
  const days = parseInt(args[2]);

  if (isNaN(days) || days <= 0) {
    return ctx.reply('Количество дней должно быть положительным числом');
  }

  try {
    // Поиск пользователя по username
    const user = await ctx.telegram.getChatMember(`@${username}`, ADMIN_USER_ID)
      .then(() => username)
      .catch(() => null);

    if (!user) {
      return ctx.reply(`Пользователь @${username} не найден`);
    }

    // В реальном приложении здесь нужно сохранить подписку в базе данных
    // Сейчас просто уведомляем об успешной операции
    await ctx.reply(`Подписка на ${days} дней выдана пользователю @${username}`);
  } catch (error) {
    console.error('Ошибка при выдаче подписки:', error);
    await ctx.reply('Произошла ошибка при выдаче подписки');
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот запущен');
}).catch((error) => {
  console.error('Ошибка при запуске бота:', error);
});

// Обработка ошибок
bot.catch((error, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}:`, error);
});

// Обработка завершения работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
