import { Telegraf, Context, session } from 'telegraf';
import { message } from 'telegraf/filters';

interface SessionData {
  phoneNumber: string | null;
  subscribedChats: string[];
  subscriptionEndDate: Date | null;
  waitingForText: boolean;
  waitingForDelay: boolean;
  messageText: string | null;
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
    subscriptionEndDate: null,
    waitingForText: false,
    waitingForDelay: false,
    messageText: null
  })
}));

// Функция для создания клавиатуры с основными командами
const getMainKeyboard = () => {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📝 Создать отложенное сообщение' }],
        [{ text: '📱 Привязать номер телефона' }],
        [{ text: '📊 Статус подписки' }, { text: '💬 Мои чаты' }],
        [{ text: '❓ Помощь' }]
      ],
      resize_keyboard: true
    }
  };
};

// Команда start
bot.start(async (ctx) => {
  const firstName = ctx.from?.first_name || 'пользователь';
  await ctx.reply(
    `👋 Добро пожаловать, ${firstName}!\n\nЯ бот для отложенной отправки сообщений в группы и чаты Telegram.\n\n` +
    `✅ Сначала привяжите свой номер телефона\n` +
    `✅ Затем добавьте меня в нужные группы\n` +
    `✅ Используйте команду /text в группе для отправки отложенных сообщений\n\n` +
    `❗️ В бесплатной версии доступно только 2 чата`,
    getMainKeyboard()
  );
});

// Команда help
bot.help(async (ctx) => {
  await ctx.reply(
    '📝 *Доступные команды:*\n\n' +
    '• /register - Привязать номер телефона\n' +
    '• /text - Создать отложенное сообщение\n' +
    '• /status - Информация о подписке\n' +
    '• /chats - Список привязанных чатов\n\n' +
    '❓ Для использования бота добавьте его в нужные вам группы и чаты.',
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
});

// Команда register для привязки номера телефона
bot.command('register', async (ctx) => {
  await requestContact(ctx);
});

// Функция запроса контакта
async function requestContact(ctx: BotContext) {
  await ctx.reply('📱 Пожалуйста, поделитесь своим контактом, нажав на кнопку ниже', {
    reply_markup: {
      keyboard: [
        [{ text: '📱 Поделиться контактом', request_contact: true }],
        [{ text: '❌ Отмена' }]
      ],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });
}

// Обработка полученного контакта
bot.on(message('contact'), async (ctx) => {
  const contact = ctx.message.contact;
  
  if (contact && contact.user_id === ctx.from.id) {
    ctx.session.phoneNumber = contact.phone_number;
    await ctx.reply(
      `✅ Ваш номер *${contact.phone_number}* успешно привязан!`,
      { parse_mode: 'Markdown', ...getMainKeyboard() }
    );
  } else {
    await ctx.reply(
      '❌ Пожалуйста, отправьте свой собственный контакт',
      getMainKeyboard()
    );
  }
});

// Функция создания отложенного сообщения
async function startCreateDelayedMessage(ctx: BotContext) {
  if (!ctx.session.phoneNumber) {
    return ctx.reply(
      '❌ Сначала привяжите номер телефона с помощью команды /register',
      getMainKeyboard()
    );
  }

  // Проверка находится ли бот в чате или группе
  if (ctx.chat.type === 'private') {
    return ctx.reply(
      '❗️ Эту команду нужно использовать в группе или чате, где вы хотите отправить отложенное сообщение.',
      getMainKeyboard()
    );
  }

  // Проверка на максимальное количество чатов для бесплатной версии
  const chatId = ctx.chat.id.toString();
  
  if (!ctx.session.subscribedChats.includes(chatId)) {
    if (ctx.session.subscribedChats.length >= 2 && !ctx.session.subscriptionEndDate) {
      return ctx.reply(
        '❌ В бесплатной версии вы можете использовать бота только в двух чатах. Обратитесь к администратору для получения подписки.',
        getMainKeyboard()
      );
    }
    
    ctx.session.subscribedChats.push(chatId);
    await ctx.reply('✅ Чат добавлен в список доступных чатов!');
  }

  ctx.session.waitingForText = true;
  await ctx.reply(
    '📝 Введите текст сообщения, которое хотите отправить с задержкой:',
    {
      reply_markup: {
        keyboard: [[{ text: '❌ Отмена' }]],
        resize_keyboard: true
      }
    }
  );
}

// Команда text для отправки отложенного сообщения
bot.command('text', async (ctx) => {
  await startCreateDelayedMessage(ctx);
});

// Обработка ввода текста сообщения
bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text;

  // Обработка кнопки отмены
  if (text === '❌ Отмена') {
    ctx.session.waitingForText = false;
    ctx.session.waitingForDelay = false;
    ctx.session.messageText = null;
    return ctx.reply('❌ Операция отменена', getMainKeyboard());
  }

  // Обработка кнопок главного меню
  if (text === '📝 Создать отложенное сообщение') {
    if (ctx.chat.type === 'private') {
      return ctx.reply(
        '❗️ Для создания отложенного сообщения перейдите в нужную группу или чат и используйте там команду /text',
        getMainKeyboard()
      );
    } else {
      return startCreateDelayedMessage(ctx);
    }
  }

  if (text === '📱 Привязать номер телефона') {
    return requestContact(ctx);
  }

  if (text === '📊 Статус подписки') {
    return showStatus(ctx);
  }

  if (text === '💬 Мои чаты') {
    return showChats(ctx);
  }

  if (text === '❓ Помощь') {
    return ctx.help();
  }

  // Обработка ввода текста сообщения
  if (ctx.session.waitingForText) {
    ctx.session.messageText = text;
    ctx.session.waitingForText = false;
    ctx.session.waitingForDelay = true;
    
    await ctx.reply(
      '⏱ Теперь введите время задержки в секундах (например, 60 для отправки через минуту):',
      {
        reply_markup: {
          keyboard: [[{ text: '❌ Отмена' }]],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // Обработка ввода времени задержки
  if (ctx.session.waitingForDelay && ctx.session.messageText) {
    const delaySeconds = parseInt(text);

    if (isNaN(delaySeconds) || delaySeconds <= 0) {
      await ctx.reply(
        '❌ Время должно быть положительным числом в секундах. Пожалуйста, введите корректное значение:',
        {
          reply_markup: {
            keyboard: [[{ text: '❌ Отмена' }]],
            resize_keyboard: true
          }
        }
      );
      return;
    }

    const messageText = ctx.session.messageText;
    const chatId = ctx.chat.id;

    // Сбрасываем состояние ожидания
    ctx.session.waitingForDelay = false;
    ctx.session.messageText = null;

    await ctx.reply(
      `✅ Сообщение будет отправлено через ${delaySeconds} секунд`,
      getMainKeyboard()
    );

    // Отправка отложенного сообщения
    setTimeout(async () => {
      try {
        await ctx.telegram.sendMessage(chatId, messageText);
        // Отправляем уведомление в личку пользователю
        if (ctx.from) {
          await ctx.telegram.sendMessage(
            ctx.from.id,
            `✅ Ваше отложенное сообщение было отправлено в чат "${ctx.chat.title || 'Группу'}"`
          );
        }
      } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        if (ctx.from) {
          await ctx.telegram.sendMessage(
            ctx.from.id,
            `❌ Ошибка при отправке отложенного сообщения в чат "${ctx.chat.title || 'Группу'}"`
          );
        }
      }
    }, delaySeconds * 1000);
  }
});

// Функция для отображения статуса подписки
async function showStatus(ctx: BotContext) {
  const subscriptionStatus = ctx.session.subscriptionEndDate 
    ? `Премиум до: ${ctx.session.subscriptionEndDate.toLocaleDateString()}`
    : 'Бесплатная версия (ограничение: 2 чата)';
  
  await ctx.reply(
    `📊 *Статус вашей подписки*\n\n` +
    `${subscriptionStatus}\n\n` +
    `Количество привязанных чатов: ${ctx.session.subscribedChats.length}`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
}

// Команда status для проверки статуса подписки
bot.command('status', async (ctx) => {
  await showStatus(ctx);
});

// Функция для отображения привязанных чатов
async function showChats(ctx: BotContext) {
  if (ctx.session.subscribedChats.length === 0) {
    return ctx.reply(
      '💬 У вас нет привязанных чатов\n\nДобавьте бота в нужную группу и используйте там команду /text',
      getMainKeyboard()
    );
  }

  const chatsList = await Promise.all(ctx.session.subscribedChats.map(async (chatId, index) => {
    try {
      const chat = await ctx.telegram.getChat(chatId);
      return `${index + 1}. ${chat.title || chat.username || chatId}`;
    } catch (error) {
      return `${index + 1}. Чат ${chatId} (нет доступа)`;
    }
  }));

  await ctx.reply(
    `💬 *Ваши привязанные чаты:*\n\n${chatsList.join('\n')}`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
}

// Команда chats для просмотра привязанных чатов
bot.command('chats', async (ctx) => {
  await showChats(ctx);
});

// Команда add для администратора (выдача подписки)
bot.command('add', async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('❌ Эта команда доступна только администратору', getMainKeyboard());
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply(
      '❗️ Используйте формат: /add [username] [days]',
      getMainKeyboard()
    );
  }

  const username = args[1].replace('@', '');
  const days = parseInt(args[2]);

  if (isNaN(days) || days <= 0) {
    return ctx.reply(
      '❌ Количество дней должно быть положительным числом',
      getMainKeyboard()
    );
  }

  try {
    // Поиск пользователя по username
    const user = await ctx.telegram.getChatMember(`@${username}`, ADMIN_USER_ID)
      .then(() => username)
      .catch(() => null);

    if (!user) {
      return ctx.reply(
        `❌ Пользователь @${username} не найден`,
        getMainKeyboard()
      );
    }

    // В реальном приложении здесь нужно сохранить подписку в базе данных
    // Сейчас просто уведомляем об успешной операции
    await ctx.reply(
      `✅ Подписка на ${days} дней выдана пользователю @${username}`,
      getMainKeyboard()
    );
  } catch (error) {
    console.error('Ошибка при выдаче подписки:', error);
    await ctx.reply(
      '❌ Произошла ошибка при выдаче подписки',
      getMainKeyboard()
    );
  }
});

// Обработка новых участников группы
bot.on('new_chat_members', async (ctx) => {
  const newMembers = ctx.message.new_chat_members;
  const botInfo = await ctx.telegram.getMe();
  
  // Проверяем, есть ли среди новых участников наш бот
  if (newMembers.some(member => member.id === botInfo.id)) {
    await ctx.reply(
      `👋 Привет! Я бот для отложенной отправки сообщений.\n\n` +
      `Чтобы отправить отложенное сообщение, используйте команду /text\n\n` +
      `❗️ Важно: для работы с ботом пользователь должен сначала привязать свой номер телефона в личных сообщениях с ботом.`
    );
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('✅ Бот успешно запущен');
}).catch((error) => {
  console.error('❌ Ошибка при запуске бота:', error);
});

// Обработка ошибок
bot.catch((error, ctx) => {
  console.error(`❌ Ошибка для ${ctx.updateType}:`, error);
});

// Обработка завершения работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
