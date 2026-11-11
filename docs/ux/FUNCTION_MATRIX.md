# Матрица функций · исходное состояние 9.52

Инвентарь всех JSX-компонентов и динамических slider/row helpers. Частоты — гипотезы без пользовательских наблюдений. Исходные callbacks и условия хранятся в control-inventory.json; физические зависимости описаны в DESIGN.md и исходниках указанного компонента. Значения по умолчанию могут быть профильными; универсальные не выдумываются.

| Функция | Назначение / влияние | Сейчас → новая архитектура | Параметры / callback | Диапазон / шаг | Зависимость | Частота (гипотеза) |
|---|---|---|---|---|---|---|
| Экспозиция при съёмке | Количество света на виртуальной плёнке: +1 EV вдвое больше, −1 EV вдвое меньше. | development → тот же раздел + прямой поиск | params.exposureCompensationEv; (value) => setParam("exposureCompensationEv", value) | Math.min(-6, params.exposureCompensationEv) / Math.max(6, params.exposureCompensationEv) / 0.1 | disabled | по задаче |
| Коэффициент проявки γ | Выше 1 — усиленная, ниже 1 — более мягкая проявка. Это не экранная гамма. | development → тот же раздел + прямой поиск | params.filmGamma; (value) => setParam("filmGamma", value) | Math.min(0.5, params.filmGamma) / Math.max(2, params.filmGamma) / 0.05 | disabled | по задаче |
| Автозамер исходного кадра | Движок подбирает базовую экспозицию перед вашим ручным сдвигом EV. | development → тот же раздел + прямой поиск | params.autoExposure; (value) => setParam("autoExposure", value) |  /  /  | disabled | по задаче |
| Автокомпенсация печати | Стабилизирует яркость отпечатка при смене экспозиции съёмки, сохраняя характер негатива. | development → тот же раздел + прямой поиск | params.printExposureCompensation; (value) => setParam("printExposureCompensation", value) |  /  /  | disabled | по задаче |
| Экспозиция кадра | Сделайте снимок светлее или темнее перед плёночной обработкой. +1 EV — вдвое больше света; настройки Push / Pull остаются прежними. | edit (устаревший алиас; рабочие контролы в Prep / Камера / Fotufilm) | params.prep.exposure; (v) => setParam("prep", { ...params.prep, exposure: v }) | -3 / 3 / 0.05 | Без условного родителя | по задаче |
| Освещение | Согласует цвет плёнки с освещением снимка. «Как снято» сохраняет исходный баланс. | edit (устаревший алиас; рабочие контролы в Prep / Камера / Fotufilm) | ;  |  /  /  | Без условного родителя | по задаче |
| Температура света | Убирает тёплый или холодный оттенок освещения. Измеряется в кельвинах. | edit (устаревший алиас; рабочие контролы в Prep / Камера / Fotufilm) | params.temperature; (v) => setParam("temperature", v) | 2000 / 12000 / 100 | params.whiteBalance === "custom" | по задаче |
| Плёночное зерно | Включает зернистую структуру эмульсии. Размер и характер частиц задаются в инструментах плёнки и Negs. | edit (устаревший алиас; рабочие контролы в Prep / Камера / Fotufilm) | params.grainActive; (v) => setParam("grainActive", v) |  /  /  | !noFilm | по задаче |
| Получение изображения | Выберите печать на бумаге или цифровой позитив. Lab Scan добавляет характер минилаба. | edit (устаревший алиас; рабочие контролы в Prep / Камера / Fotufilm) | ;  |  /  /  | !noFilm | по задаче |
| Фотобумага | Материал виртуального отпечатка: меняет его контраст и цвет. | edit (устаревший алиас; рабочие контролы в Prep / Камера / Fotufilm) | ;  |  /  /  | displayMode === "paper" → !noFilm | по задаче |
| Источник изображения | Обычная фотография проходит эмуляцию плёнки. Скан настоящего негатива требует отдельного обратного расчёта. | negative → тот же раздел + прямой поиск | ;  |  /  /  | mode==="negative" | по задаче |
| Свет сканера / пересъёмки | Реальный спектр источника, которым освещали негатив при сканировании или пересъёмке. | negative → тот же раздел + прямой поиск | ;  |  /  /  | e.workflow !== "normal" → mode==="negative" | по задаче |
| Ускорять предпросмотр скана | Использует вычислительную таблицу для скорости. Экспорт сохраняет прямой расчёт плотностей. | negative → тот же раздел + прямой поиск | e.scanUseLut; (v) => change("scanUseLut", v) |  /  /  | e.workflow !== "normal" → mode==="negative" | по задаче |
| Экспозиция скана · EV | Согласует яркость сканера с моделью до восстановления плотностей. Не заменяет цветовую настройку маски. | negative → тот же раздел + прямой поиск | experimental.scanExposure; slider("scanExposure", "Экспозиция скана · EV", -12, 12, 0.1) | -12 / 12 / 0.1 | e.workflow !== "normal" → mode==="negative" | по задаче |
| Порог определения маски · % | Какая самая светлая доля скана считается чистой основой. 99% означает верхний 1% пикселей. | negative → тот же раздел + прямой поиск | experimental.scanBasePercentile; slider("scanBasePercentile", "Порог определения маски · %", 90, 100, 0.1) | 90 / 100 / 0.1 | e.workflow !== "normal" → mode==="negative" | по задаче |
| Матрица устройства · 9 чисел | Коррекция цветового отклика сканера. Оставьте единичную матрицу или используйте автоматический подбор. | negative → тот же раздел + прямой поиск | ;  |  /  /  | e.workflow !== "normal" → mode==="negative" | по задаче |
| Матрица устройства | Поправка цветового смешения каналов сканера или камеры при конвертации настоящего негатива. | negative → тот же раздел + прямой поиск | e.scanCalibration; (ev) => change("scanCalibration", ev.target.value) |  /  /  | e.workflow !== "normal" → mode==="negative" | по задаче |
| Фильтр перед объективом | Цветной фильтр меняет свет до эмульсии. Особенно полезен для разделения тонов на Ч/Б плёнке. | emulsion → тот же раздел + прямой поиск | ;  |  /  /  | mode==="advanced" | по задаче |
| Метод спектральной реконструкции | Способ восстановления спектрального света из RGB. «Авто» использует настройки материала. | emulsion → тот же раздел + прямой поиск | ;  |  /  /  | mode==="advanced" | по задаче |
| Время проявки из профиля | Выбирает готовую кривую выбранного материала. Оценённые времена отмечены, промежуточные измерения не выдумываются. | development → тот же раздел + прямой поиск | ;  |  /  /  | family → mode==="chemistry" | по задаче |
| Химия плёнки по слоям | Отдельное управление быстрыми и медленными слоями и каналами параметрической модели. | development → тот же раздел + прямой поиск | e.filmChemistry; (v) => {             if (!v // profile?.densityModel) change("filmChemistry", v);           } |  /  /  | mode==="chemistry" | по задаче |
| Общая проявка γ | Общий коэффициент проявки. Учитывается один раз вместе с коэффициентами слоёв. | development → тот же раздел + прямой поиск | params.filmGamma; (v) => setParam("filmGamma", v) | 0.5 / 2 / 0.05 | e.filmChemistry → mode==="chemistry" | по задаче |
| Быстрые слои γ | Коэффициент проявки выбранного слоя или канала: выше 1 усиливает, ниже 1 смягчает его кривую. | development → тот же раздел + прямой поиск | experimental.filmFast; slider("filmFast", "Быстрые слои γ") | 0.2 / 2 / 0.05 | e.filmChemistry → mode==="chemistry" | по задаче |
| Средние и медленные слои γ | Коэффициент проявки выбранного слоя или канала: выше 1 усиливает, ниже 1 смягчает его кривую. | development → тот же раздел + прямой поиск | experimental.filmSlow; slider("filmSlow", "Средние и медленные слои γ") | 0.2 / 2 / 0.05 | e.filmChemistry → mode==="chemistry" | по задаче |
| Канал эмульсии γ | Коэффициент проявки выбранного слоя или канала: выше 1 усиливает, ниже 1 смягчает его кривую. | development → тот же раздел + прямой поиск | experimental.filmRed; slider("filmRed", profile?.monochrome ? "Канал эмульсии γ" : "Красный канал γ") | 0.2 / 2 / 0.05 | e.filmChemistry → mode==="chemistry" | по задаче |
| Красный канал γ | Коэффициент проявки выбранного слоя или канала: выше 1 усиливает, ниже 1 смягчает его кривую. | development → тот же раздел + прямой поиск | experimental.filmRed; slider("filmRed", profile?.monochrome ? "Канал эмульсии γ" : "Красный канал γ") | 0.2 / 2 / 0.05 | e.filmChemistry → mode==="chemistry" | по задаче |
| Зелёный канал γ | Коэффициент проявки выбранного слоя или канала: выше 1 усиливает, ниже 1 смягчает его кривую. | development → тот же раздел + прямой поиск | experimental.filmGreen; slider("filmGreen", "Зелёный канал γ") | 0.2 / 2 / 0.05 | !profile?.monochrome → e.filmChemistry → mode==="chemistry" | по задаче |
| Синий канал γ | Коэффициент проявки выбранного слоя или канала: выше 1 усиливает, ниже 1 смягчает его кривую. | development → тот же раздел + прямой поиск | experimental.filmBlue; slider("filmBlue", "Синий канал γ") | 0.2 / 2 / 0.05 | !profile?.monochrome → e.filmChemistry → mode==="chemistry" | по задаче |
| Истощение проявителя | Меняет форму кривых из-за истощения проявителя, сохраняя опорную плотность. | development → тот же раздел + прямой поиск | experimental.filmExhaustion; slider("filmExhaustion", "Истощение проявителя", 0, 1) | 0 / 1 / 0.05 | e.filmChemistry → mode==="chemistry" | по задаче |
| Нелинейная модель Langmuir | Ограничивает действие ингибиторов при насыщении вместо бесконечного линейного усиления. | negs → тот же раздел + прямой поиск | e.dirLangmuir; (v) => change("dirLangmuir", v) |  /  /  | mode==="dir" | по задаче |
| Насыщение приёмника R | Предел реакции принимающего слоя слайдовой плёнки на ингибитор. | negs → тот же раздел + прямой поиск | experimental.dirReceiverRed; slider("dirReceiverRed", "Насыщение приёмника R", 0.05, 10) | 0.05 / 10 / 0.05 | profile?.type === "positive" → e.dirLangmuir → mode==="dir" | по задаче |
| Насыщение приёмника G | Предел реакции принимающего слоя слайдовой плёнки на ингибитор. | negs → тот же раздел + прямой поиск | experimental.dirReceiverGreen; slider("dirReceiverGreen", "Насыщение приёмника G", 0.05, 10) | 0.05 / 10 / 0.05 | !profile?.monochrome → profile?.type === "positive" → e.dirLangmuir → mode==="dir" | по задаче |
| Насыщение приёмника B | Предел реакции принимающего слоя слайдовой плёнки на ингибитор. | negs → тот же раздел + прямой поиск | experimental.dirReceiverBlue; slider("dirReceiverBlue", "Насыщение приёмника B", 0.05, 10) | 0.05 / 10 / 0.05 | !profile?.monochrome → profile?.type === "positive" → e.dirLangmuir → mode==="dir" | по задаче |
| Насыщение донора R | Предел выделения ингибитора развивающимся слоем негатива. | negs → тот же раздел + прямой поиск | experimental.dirDonorRed; slider("dirDonorRed", "Насыщение донора R", 0.05, 10) | 0.05 / 10 / 0.05 | profile?.type === "positive" → e.dirLangmuir → mode==="dir" | по задаче |
| Насыщение донора G | Предел выделения ингибитора развивающимся слоем негатива. | negs → тот же раздел + прямой поиск | experimental.dirDonorGreen; slider("dirDonorGreen", "Насыщение донора G", 0.05, 10) | 0.05 / 10 / 0.05 | !profile?.monochrome → profile?.type === "positive" → e.dirLangmuir → mode==="dir" | по задаче |
| Насыщение донора B | Предел выделения ингибитора развивающимся слоем негатива. | negs → тот же раздел + прямой поиск | experimental.dirDonorBlue; slider("dirDonorBlue", "Насыщение донора B", 0.05, 10) | 0.05 / 10 / 0.05 | !profile?.monochrome → profile?.type === "positive" → e.dirLangmuir → mode==="dir" | по задаче |
| Хвост диффузии, мкм | Дальность медленно затухающего распространения ингибитора за пределами основного радиуса. | negs → тот же раздел + прямой поиск | experimental.dirTailUm; slider("dirTailUm", "Хвост диффузии, мкм", 0, 1000, 10) | 0 / 1000 / 10 | e.dirLangmuir → mode==="dir" | по задаче |
| Доля хвоста диффузии | Доля длинного хвоста в общем распространении ингибитора. | negs → тот же раздел + прямой поиск | experimental.dirTailWeight; slider("dirTailWeight", "Доля хвоста диффузии", 0, 1, 0.01) | 0 / 1 / 0.01 | e.dirLangmuir → mode==="dir" | по задаче |
| Зернистость по RMS | Размер частиц рассчитывается из гранулярности профиля. В этом режиме ручной размер частицы не применяется. | negs → тот же раздел + прямой поиск | e.grainRms; (v) => change("grainRms", v) |  /  /  | mode==="grain" | по задаче |
| RMS эмульсии | Гранулярность при апертуре 48 мкм: больше — заметнее зерно. Размер частиц рассчитывается из модели слоёв. | negs → тот же раздел + прямой поиск | experimental.grainRmsRed; slider(               "grainRmsRed",               profile?.monochrome ? "RMS эмульсии" : "RMS красного канала",               0.1,               60,               0.1,             ) | 0.1 / 60 / 0.1 | e.grainRms → mode==="grain" | по задаче |
| RMS красного канала | Гранулярность при апертуре 48 мкм: больше — заметнее зерно. Размер частиц рассчитывается из модели слоёв. | negs → тот же раздел + прямой поиск | experimental.grainRmsRed; slider(               "grainRmsRed",               profile?.monochrome ? "RMS эмульсии" : "RMS красного канала",               0.1,               60,               0.1,             ) | 0.1 / 60 / 0.1 | e.grainRms → mode==="grain" | по задаче |
| RMS зелёного канала | Гранулярность при апертуре 48 мкм: больше — заметнее зерно. Размер частиц рассчитывается из модели слоёв. | negs → тот же раздел + прямой поиск | experimental.grainRmsGreen; slider("grainRmsGreen", "RMS зелёного канала", 0.1, 60, 0.1) | 0.1 / 60 / 0.1 | !profile?.monochrome → e.grainRms → mode==="grain" | по задаче |
| RMS синего канала | Гранулярность при апертуре 48 мкм: больше — заметнее зерно. Размер частиц рассчитывается из модели слоёв. | negs → тот же раздел + прямой поиск | experimental.grainRmsBlue; slider("grainRmsBlue", "RMS синего канала", 0.1, 60, 0.1) | 0.1 / 60 / 0.1 | !profile?.monochrome → e.grainRms → mode==="grain" | по задаче |
| Равномерность R | Равномерность образования частиц в этом канале. Для Ч/Б используется один канал эмульсии. | negs → тот же раздел + прямой поиск | experimental.grainUniformityRed; slider("grainUniformityRed", "Равномерность R", 0, 1, 0.01) | 0 / 1 / 0.01 | e.grainRms → mode==="grain" | по задаче |
| Равномерность G | Равномерность образования частиц в этом канале. Для Ч/Б используется один канал эмульсии. | negs → тот же раздел + прямой поиск | experimental.grainUniformityGreen; slider("grainUniformityGreen", "Равномерность G", 0, 1, 0.01) | 0 / 1 / 0.01 | !profile?.monochrome → e.grainRms → mode==="grain" | по задаче |
| Равномерность B | Равномерность образования частиц в этом канале. Для Ч/Б используется один канал эмульсии. | negs → тот же раздел + прямой поиск | experimental.grainUniformityBlue; slider("grainUniformityBlue", "Равномерность B", 0, 1, 0.01) | 0 / 1 / 0.01 | !profile?.monochrome → e.grainRms → mode==="grain" | по задаче |
| Минимальная плотность R | Плотность, участвующая в образовании зерна даже при небольшой экспозиции. | negs → тот же раздел + прямой поиск | experimental.grainFloorRed; slider("grainFloorRed", "Минимальная плотность R", 0, 0.5, 0.01) | 0 / 0.5 / 0.01 | e.grainRms → mode==="grain" | по задаче |
| Минимальная плотность G | Плотность, участвующая в образовании зерна даже при небольшой экспозиции. | negs → тот же раздел + прямой поиск | experimental.grainFloorGreen; slider("grainFloorGreen", "Минимальная плотность G", 0, 0.5, 0.01) | 0 / 0.5 / 0.01 | !profile?.monochrome → e.grainRms → mode==="grain" | по задаче |
| Минимальная плотность B | Плотность, участвующая в образовании зерна даже при небольшой экспозиции. | negs → тот же раздел + прямой поиск | experimental.grainFloorBlue; slider("grainFloorBlue", "Минимальная плотность B", 0, 0.5, 0.01) | 0 / 0.5 / 0.01 | !profile?.monochrome → e.grainRms → mode==="grain" | по задаче |
| Размер частиц · слой 1 | Относительный размер частиц подслоя. Разные подслои дают разную фактуру при разной плотности. | negs → тот же раздел + прямой поиск | experimental.grainScaleFast; slider("grainScaleFast", "Размер частиц · слой 1", 0.05, 3) | 0.05 / 3 / 0.05 | e.grainRms → mode==="grain" | по задаче |
| Размер частиц · слой 2 | Относительный размер частиц подслоя. Разные подслои дают разную фактуру при разной плотности. | negs → тот же раздел + прямой поиск | experimental.grainScaleMid; slider("grainScaleMid", "Размер частиц · слой 2", 0.05, 3) | 0.05 / 3 / 0.05 | e.grainRms → mode==="grain" | по задаче |
| Размер частиц · слой 3 | Относительный размер частиц подслоя. Разные подслои дают разную фактуру при разной плотности. | negs → тот же раздел + прямой поиск | experimental.grainScaleSlow; slider("grainScaleSlow", "Размер частиц · слой 3", 0.05, 3) | 0.05 / 3 / 0.05 | e.grainRms → mode==="grain" | по задаче |
| Радиус резкости плотности | Ширина усиления деталей в плотности эмульсии после зерна. | negs → тот же раздел + прямой поиск | experimental.grainUsmSigma; slider("grainUsmSigma", "Радиус резкости плотности", 0, 3, 0.1) | 0 / 3 / 0.1 | e.grainRms → mode==="grain" | по задаче |
| Усиление резкости плотности | Сила повышения резкости плотности. Суммарная плотность канала сохраняется. | negs → тот же раздел + прямой поиск | experimental.grainUsmAmount; slider("grainUsmAmount", "Усиление резкости плотности", 0, 4, 0.1) | 0 / 4 / 0.1 | e.grainRms → mode==="grain" | по задаче |
| Время проявки печатной плёнки | Готовая кривая проявки печатной плёнки для выбранного времени. | print → тот же раздел + прямой поиск | ;  |  /  /  | paperFamily → mode==="paper" | по задаче |
| Настройка основы плёнки | Меняет спектральную плотность подложки и оранжевой маски плёнки. | emulsion → тот же раздел + прямой поиск | Boolean(e[active]); (v) => change(active, v) |  /  /  | ["advanced","negative","paper"].includes(mode) | по задаче |
| Настройка основы плёнки | Меняет спектральную плотность подложки и оранжевой маски плёнки. | negative → тот же раздел + прямой поиск | Boolean(e[active]); (v) => change(active, v) |  /  /  | ["advanced","negative","paper"].includes(mode) | по задаче |
| Настройка основы бумаги | Меняет плотность и оттенок подложки фотобумаги. | print → тот же раздел + прямой поиск | Boolean(e[active]); (v) => change(active, v) |  /  /  | ["advanced","negative","paper"].includes(mode) | по задаче |
| Общая плотность основы | Оптическая плотность подложки: большее значение пропускает меньше света. | emulsion → тот же раздел + прямой поиск | experimental.filmBaseScale; slider(                   (prefix + "Scale") as keyof ExperimentalParams,                   "Общая плотность основы",                   0,                   3,                 ) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Общая плотность основы | Оптическая плотность подложки: большее значение пропускает меньше света. | negative → тот же раздел + прямой поиск | experimental.filmBaseScale; slider(                   (prefix + "Scale") as keyof ExperimentalParams,                   "Общая плотность основы",                   0,                   3,                 ) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Общая плотность основы | Оптическая плотность подложки: большее значение пропускает меньше света. | print → тот же раздел + прямой поиск | experimental.printBaseScale; slider(                   (prefix + "Scale") as keyof ExperimentalParams,                   "Общая плотность основы",                   0,                   3,                 ) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Циан основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | emulsion → тот же раздел + прямой поиск | experimental.filmBaseCyan; slider((prefix + "Cyan") as keyof ExperimentalParams, "Циан основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Циан основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | negative → тот же раздел + прямой поиск | experimental.filmBaseCyan; slider((prefix + "Cyan") as keyof ExperimentalParams, "Циан основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Циан основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | print → тот же раздел + прямой поиск | experimental.printBaseCyan; slider((prefix + "Cyan") as keyof ExperimentalParams, "Циан основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Маджента основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | emulsion → тот же раздел + прямой поиск | experimental.filmBaseMagenta; slider((prefix + "Magenta") as keyof ExperimentalParams, "Маджента основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Маджента основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | negative → тот же раздел + прямой поиск | experimental.filmBaseMagenta; slider((prefix + "Magenta") as keyof ExperimentalParams, "Маджента основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Маджента основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | print → тот же раздел + прямой поиск | experimental.printBaseMagenta; slider((prefix + "Magenta") as keyof ExperimentalParams, "Маджента основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Жёлтый основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | emulsion → тот же раздел + прямой поиск | experimental.filmBaseYellow; slider((prefix + "Yellow") as keyof ExperimentalParams, "Жёлтый основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Жёлтый основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | negative → тот же раздел + прямой поиск | experimental.filmBaseYellow; slider((prefix + "Yellow") as keyof ExperimentalParams, "Жёлтый основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Жёлтый основы | Масштаб выбранной составляющей спектральной плотности основы. Нейтральное значение — 1. | print → тот же раздел + прямой поиск | experimental.printBaseYellow; slider((prefix + "Yellow") as keyof ExperimentalParams, "Жёлтый основы", 0, 3) | 0 / 3 / 0.05 | e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Спектральный наклон | Меняет соотношение плотности основы в коротковолновой и длинноволновой частях спектра. | emulsion → тот же раздел + прямой поиск | experimental.filmBaseTilt; slider("filmBaseTilt", "Спектральный наклон", -1, 1) | -1 / 1 / 0.05 | kind === "film" → e[active] → ["advanced","negative","paper"].includes(mode) | по задаче |
| Использовать Layered Transport | Включает послойную модель возврата света Fotufilm. Отключение возвращает прежнюю галяцию Spektrafilm; оптические параметры находятся ниже. | fotufilm → тот же раздел + прямой поиск | sourceOnly?p.model==="layered"&&params.halationActive:params.halationActive; (v) => sourceOnly?patch({transport:{...p,model:v?"layered":"legacy"},...(v?{halationActive:true}:{})}):setParam("halationActive", v) |  /  /  | Без условного родителя | по задаче |
| Модель свечения | Прежняя модель даёт мягкий ореол. Layered Transport рассчитывает возврат света внутри слоёв плёнки. | fotufilm → тот же раздел + прямой поиск | ;  |  /  /  | !sourceOnly → params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Сила гало | Количество света, возвращающегося в эмульсию: выше — заметнее ореолы у ярких объектов. | fotufilm → тот же раздел + прямой поиск | params.halationAmount; (v) => setParam("halationAmount", v) | 0 / 3 / 0.05 | params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Размер гало | Масштаб светового ореола. Не меняет общую резкость фотографии. | fotufilm → тот же раздел + прямой поиск | params.halationSpatialScale; (v) => setParam("halationSpatialScale", v) | 0.2 / 3 / 0.1 | params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Нормализация | Сохраняет суммарный вклад переотражений при изменении их числа. | film → тот же раздел + прямой поиск | params.halationRenormalize; (v) => setParam("halationRenormalize", v) |  /  /  | showLegacyDetails && p.model === "legacy" → params.halationActive && (!sourceOnly//p.model==="layered") | часто |
| Антигаляционный слой | Поглощает отражённый свет. 1 — исходная модель; 0 — слой убран и свечение сильнее. | fotufilm → тот же раздел + прямой поиск | p.antiHalation; (v) => update("antiHalation", v) | 0 / 4 / 0.05 | p.model === "layered" → params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Толщина основы | 1 — исходная толщина подложки. Более толстая основа увеличивает путь света и расширяет кольцо гало. | fotufilm → тот же раздел + прямой поиск | p.baseThickness; (v) => update("baseThickness", v) | 0.25 / 3 / 0.05 | p.model === "layered" → params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Отражение прижимной пластины | Возвращает свет от пластины за плёнкой. На материале с непрозрачной подложкой пластина не влияет. | fotufilm → тот же раздел + прямой поиск | p.pressurePlate; (v) => update("pressurePlate", v) | 0 / 1 / 0.05 | p.model === "layered" → params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Мутность основы | Смягчает возвращённый свет рассеянием внутри подложки. 0 — без добавочного размытия. | fotufilm → тот же раздел + прямой поиск | p.hazeUm; (v) => update("hazeUm", v) | 0 / 500 / 5 | p.model === "layered" → params.halationActive && (!sourceOnly//p.model==="layered") | по задаче |
| Способ получения результата | Выбирает приёмник проявленной плёнки. Этот выбор влияет на изображение, а не на формат JPEG или PNG. | fotufilm → тот же раздел + прямой поиск | ;  |  /  /  | Без условного родителя | по задаче |
| Автонастройка минилаба | По медиане и ярким участкам кадра подбирает плотность и контраст. Отключите для одинаковой настройки всей серии. | fotufilm → тот же раздел + прямой поиск | p.autoSetup; autoSetup=>update({autoSetup}) |  /  /  | p.mode==='lab-scan'&&!isPositive&&!negativeWorkflow&&!noFilm | по задаче |
| Характер минилаба | Сила оригинальной отделки LabScanFinish из Fotufilm: глубокий чёрный, прохладные тени и коррекция оттенков. 0 оставляет нейтральный скан. | fotufilm → тот же раздел + прямой поиск | output.look; row('look','Характер минилаба',0,1) | 0 / 1 / 0.05 | p.mode==='lab-scan'&&!isPositive&&!negativeWorkflow&&!noFilm | по задаче |
| Яркость скана | Операторская поправка к готовому цифровому позитиву. Не меняет экспозицию виртуальной плёнки и её проявку. | fotufilm → тот же раздел + прямой поиск | output.exposure; row('exposure','Яркость скана',-6,6) | -6 / 6 / 0.05 | ['digital','auto-levels','lab-scan'].includes(p.mode)&&!noFilm&&!isPositive&&!negativeWorkflow | по задаче |
| Ключ Cyan | Сдвиг цифрового скана к циану или красному. Положительное значение убирает красный. | fotufilm → тот же раздел + прямой поиск | output.cyan; row('cyan','Ключ Cyan',-1,1) | -1 / 1 / 0.05 | ['digital','auto-levels','lab-scan'].includes(p.mode)&&!noFilm&&!isPositive&&!negativeWorkflow | по задаче |
| Ключ Magenta | Сдвиг цифрового скана к мадженте или зелёному. Положительное значение убирает зелёный. | fotufilm → тот же раздел + прямой поиск | output.magenta; row('magenta','Ключ Magenta',-1,1) | -1 / 1 / 0.05 | ['digital','auto-levels','lab-scan'].includes(p.mode)&&!noFilm&&!isPositive&&!negativeWorkflow | по задаче |
| Ключ Yellow | Сдвиг цифрового скана к жёлтому или синему. Положительное значение убирает синий. | fotufilm → тот же раздел + прямой поиск | output.yellow; row('yellow','Ключ Yellow',-1,1) | -1 / 1 / 0.05 | ['digital','auto-levels','lab-scan'].includes(p.mode)&&!noFilm&&!isPositive&&!negativeWorkflow | по задаче |
| Зерно | Включает случайную структуру эмульсии, зависящую от плотности изображения. | film → тот же раздел + прямой поиск | params.grainActive; (v) => setParam("grainActive", v) |  /  /  | params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Частица, µm² | Площадь частиц в прежней модели: больше — крупнее и заметнее зерно. Только при выключенном RMS. | film → тот же раздел + прямой поиск | params.grainParticleArea; (v) => setParam("grainParticleArea", v) | 0.04 / 1.2 / 0.02 | params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Размытие | Смягчает структуру выбранного эффекта. Для зерна это сглаживание после формирования частиц. | film → тот же раздел + прямой поиск | params.grainBlur; (v) => setParam("grainBlur", v) | 0 / 1.4 / 0.05 | params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Подслои | Разделяет образование зерна по подслоям эмульсии, если профиль содержит их данные. | film → тот же раздел + прямой поиск | params.grainSublayers; (v) => setParam("grainSublayers", v) |  /  /  | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Равномерность | Регулирует статистику распределения частиц. В режиме RMS задаётся отдельно для каналов. | film → тот же раздел + прямой поиск | params.grainUniformity; (v) => setParam("grainUniformity", v) | 0.85 / 0.995 / 0.005 | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Dmin зерна | Нижний уровень плотности, участвующий в образовании зерна, в том числе в светлых участках. | film → тот же раздел + прямой поиск | params.grainDensityMin; (v) => setParam("grainDensityMin", v) | 0 / 0.3 / 0.01 | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Облака, µm | Размер облаков красителя вокруг частиц. Влияет на мягкость структуры, а не на фокус объектива. | film → тот же раздел + прямой поиск | params.grainDyeCloudsUm; (v) => setParam("grainDyeCloudsUm", v) | 0 / 4 / 0.1 | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Масштаб R | Относительный размер частиц в выбранном цветовом канале прежней модели зерна. | film → тот же раздел + прямой поиск | params.grainScaleR; (v) => setParam("grainScaleR", v) | 0.4 / 4 / 0.05 | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Масштаб G | Относительный размер частиц в выбранном цветовом канале прежней модели зерна. | film → тот же раздел + прямой поиск | params.grainScaleG; (v) => setParam("grainScaleG", v) | 0.4 / 4 / 0.05 | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Масштаб B | Относительный размер частиц в выбранном цветовом канале прежней модели зерна. | film → тот же раздел + прямой поиск | params.grainScaleB; (v) => setParam("grainScaleB", v) | 0.4 / 5 / 0.05 | advanced → params.grainActive → params.experimental.grainRms → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Галяция | Свечение у ярких объектов из-за отражения света внутри плёнки. | film → тот же раздел + прямой поиск | params.halationActive; (v) => setParam("halationActive", v) |  /  /  | params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Сила | Сила ореолов вокруг ярких объектов. Ноль убирает их вклад. | film → тот же раздел + прямой поиск | params.halationAmount; (v) => setParam("halationAmount", v) | 0 / 3 / 0.05 | params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Размер | Ширина ореолов вокруг ярких участков; не меняет яркость самого источника. | film → тот же раздел + прямой поиск | params.halationSpatialScale; (v) => setParam("halationSpatialScale", v) | 0.2 / 3 / 0.1 | params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Рассеяние | Мягкое распространение света внутри эмульсии; может снизить локальный контраст. | film → тот же раздел + прямой поиск | params.scatterAmount; (v) => setParam("scatterAmount", v) | 0 / 2 / 0.05 | params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Масштаб рассеяния | Радиус мягкого рассеяния внутри плёнки; увеличивайте для более широкого эффекта. | film → тот же раздел + прямой поиск | params.scatterSpatialScale; (v) => setParam("scatterSpatialScale", v) | 0.2 / 3 / 0.1 | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Подсветка EV | Восстановление запаса яркости перед рассеянием: сильные света дадут заметнее ореолы. | film → тот же раздел + прямой поиск | params.boostEv; (v) => setParam("boostEv", v) | 0 / 4 / 0.5 | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Защита EV | Порог защиты очень ярких участков при восстановлении светов. | film → тот же раздел + прямой поиск | params.protectEv; (v) => setParam("protectEv", v) | 0 / 8 / 0.5 | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Диапазон | Плавность перехода между обычными светами и усилением подсветки. | film → тот же раздел + прямой поиск | params.boostRange; (v) => setParam("boostRange", v) | 0.05 / 1 / 0.05 | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Отскоки | Число учитываемых переотражений света в модели ореола. | film → тот же раздел + прямой поиск | params.halationNBounces; (v) => setParam("halationNBounces", v) | 1 / 5 / 1 | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Затухание | Насколько быстро ослабевают последующие переотражения света. | film → тот же раздел + прямой поиск | params.halationBounceDecay; (v) => setParam("halationBounceDecay", v) | 0.1 / 0.95 / 0.05 | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Нормализация | Сохраняет суммарный вклад переотражений при изменении их числа. | film → тот же раздел + прямой поиск | params.halationRenormalize; (v) => setParam("halationRenormalize", v) |  /  /  | advanced → params.halationActive → params.transport.model==='layered' → isFilmBypass(params.filmStock) → tool === "film" | часто |
| DIR-каплеры | Взаимодействие проявляющихся слоёв. Меняет локальный контраст, края и цветовые переходы. | film → тот же раздел + прямой поиск | params.couplersActive; (v) => setParam("couplersActive", v) |  /  /  | params.experimental.dirLangmuir → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Количество | Общая сила взаимодействия слоёв. Ноль отключает вклад каплеров. | film → тот же раздел + прямой поиск | params.couplersAmount; (v) => setParam("couplersAmount", v) | 0 / 2.5 / 0.05 | params.couplersActive → params.experimental.dirLangmuir → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Межслойное | Насколько проявка одного цветного слоя влияет на соседние слои. | film → тот же раздел + прямой поиск | params.inhibitionInterlayer; (v) => setParam("inhibitionInterlayer", v) | 0 / 2 / 0.05 | params.couplersActive → params.experimental.dirLangmuir → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Свой слой | Насколько проявляющийся слой сдерживает собственное дальнейшее развитие. | film → тот же раздел + прямой поиск | params.inhibitionSamelayer; (v) => setParam("inhibitionSamelayer", v) | 0 / 2 / 0.05 | params.couplersActive → params.experimental.dirLangmuir → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Диффузия, µm | Дальность распространения ингибиторов. Влияет на ширину краевых эффектов. | film → тот же раздел + прямой поиск | params.couplerDiffusionUm; (v) => setParam("couplerDiffusionUm", v) | 0 / 80 / 5 | advanced → params.couplersActive → params.experimental.dirLangmuir → isFilmBypass(params.filmStock) → tool === "film" | часто |
| Стиль | Характер цветопередачи выбранного цифрового движка. | tone → тот же раздел + прямой поиск | ;  |  /  /  | rawEngineNeeded(params.rawEngine) && stylesFor(params.rawEngine).length → tool === "tone" | по задаче |
| Яркость | Коррекция яркости цифрового результата. Для плёнки используйте экспозицию съёмки или печати. | tone → тот же раздел + прямой поиск | params.toneBrightness ?? 0; (v) => setParam("toneBrightness", v) | -1 / 1 / 0.02 | tool === "tone" | по задаче |
| Контраст | Разница между светлыми и тёмными участками цифрового результата. | tone → тот же раздел + прямой поиск | params.toneContrast ?? 0; (v) => setParam("toneContrast", v) | -1 / 1 / 0.02 | tool === "tone" | по задаче |
| Света | Снижайте, чтобы приглушить яркие участки; повышайте, чтобы сделать их заметнее. | tone → тот же раздел + прямой поиск | params.toneHighlights ?? 0; (v) => setParam("toneHighlights", v) | -1 / 1 / 0.02 | tool === "tone" | по задаче |
| Тени | Поднимает или затемняет тёмные участки, сохраняя границы объектов. | tone → тот же раздел + прямой поиск | params.toneShadows ?? 0; (v) => setParam("toneShadows", v) | -1 / 1 / 0.02 | tool === "tone" | по задаче |
| Насыщенность | Общая интенсивность цветов цифрового результата. | tone → тот же раздел + прямой поиск | params.toneSaturation ?? 0; (v) => setParam("toneSaturation", v) | -1 / 1 / 0.02 | tool === "tone" | по задаче |
| Теплота | Цифровой сдвиг цвета между холодным и тёплым оттенком. | tone → тот же раздел + прямой поиск | params.toneWarmth ?? 0; (v) => setParam("toneWarmth", v) | -1 / 1 / 0.02 | tool === "tone" | по задаче |
| EV | Ручная экспозиция съёмки. Одна ступень соответствует удвоению количества света. | camera → тот же раздел + прямой поиск | params.exposureCompensationEv; (v) => setParam("exposureCompensationEv", v) | -3 / 3 / 0.25 | tool === "camera" | часто |
| Автоэкспозиция | Автоматический выбор начальной экспозиции исходного изображения. | camera → тот же раздел + прямой поиск | params.autoExposure; (v) => setParam("autoExposure", v) |  /  /  | tool === "camera" | часто |
| Замер | Какие участки определяют автоматическую экспозицию: весь кадр, центр или света. | camera → тот же раздел + прямой поиск | ;  |  /  /  | params.autoExposure → tool === "camera" | часто |
| Формат, мм | Длинная сторона виртуального кадра. Больший формат делает зерно и свечение относительно мельче. | camera → тот же раздел + прямой поиск | params.filmFormatMm; (v) => setParam("filmFormatMm", v) | 8 / 120 / 1 | tool === "camera" | часто |
| Баланс белого | Убирает цвет освещения, чтобы нейтральные объекты не уходили в синий или жёлтый. | camera → тот же раздел + прямой поиск | ;  |  /  /  | tool === "camera" | часто |
| Температура, K | Компенсация тёплого или холодного освещения. Ручная температура включает свой баланс белого. | camera → тот же раздел + прямой поиск | params.temperature; (v) => patch({ temperature: v, whiteBalance: "custom" }) | WB_TMIN / WB_TMAX / 50 | tool === "camera" | часто |
| Тинт | Компенсация зелёного или пурпурного оттенка освещения. | camera → тот же раздел + прямой поиск | params.tint; (v) => patch({ tint: v, whiteBalance: "custom" }) | WB_TINT_MIN / 150 / 1 | tool === "camera" | часто |
| UV-срез | Ослабляет коротковолновую часть света перед плёнкой; эффект зависит от чувствительности материала. | camera → тот же раздел + прямой поиск | params.filterUvAmount; (v) => setParam("filterUvAmount", v) | 0 / 1 / 0.05 | tool === "camera" | часто |
| IR-срез | Ослабляет длинноволновую часть света перед плёнкой. Это не извлечение ИК-данных из RGB. | camera → тот же раздел + прямой поиск | params.filterIrAmount; (v) => setParam("filterIrAmount", v) | 0 / 1 / 0.05 | tool === "camera" | часто |
| Размытие объектива | Смягчение деталей до появления зерна, как у менее резкого объектива. | camera → тот же раздел + прямой поиск | params.cameraLensBlurUm; (v) => setParam("cameraLensBlurUm", v) | 0 / 12 / 0.1 | tool === "camera" | часто |
| Диффузия | Оптический рассеивающий фильтр: мягкость и свечение до следующего этапа обработки. | camera → тот же раздел + прямой поиск | params.cameraDiffusion.active; (v) => patch({ cameraDiffusion: { ...params.cameraDiffusion, active: v } }) |  /  /  | tool === "camera" | часто |
| Фильтр | Оптический рассеивающий фильтр, имитирующий мягкость и свечение объектива. | camera → тот же раздел + прямой поиск | ;  |  /  /  | params.cameraDiffusion.active → tool === "camera" | часто |
| Сила | Сила ореолов вокруг ярких объектов. Ноль убирает их вклад. | camera → тот же раздел + прямой поиск | params.cameraDiffusion.strength; (v) => patch({ cameraDiffusion: { ...params.cameraDiffusion, strength: v } }) | 0 / 2 / 0.125 | params.cameraDiffusion.active → tool === "camera" | часто |
| Масштаб PSF | Радиус оптического рассеяния фильтра. | camera → тот же раздел + прямой поиск | params.cameraDiffusion.spatialScale; (v) => patch({ cameraDiffusion: { ...params.cameraDiffusion, spatialScale: v } }) | 0 / 4 / 0.1 | advanced → params.cameraDiffusion.active → tool === "camera" | часто |
| Гамма | Контраст проявки бумаги, а не яркость экрана. | print → тот же раздел + прямой поиск | params.printGamma; (v) => setParam("printGamma", v) | 0.5 / 2 / 0.05 | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Экспозиция | Выдержка при печати: большее значение обычно затемняет отпечаток. | print → тот же раздел + прямой поиск | params.printExposure; (v) => setParam("printExposure", v) | 0.2 / 3 / 0.02 | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Автоэкспозиция | Автоматический выбор начальной экспозиции исходного изображения. | print → тот же раздел + прямой поиск | params.printExposureCompensation; (v) => setParam("printExposureCompensation", v) |  /  /  | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Y, CC | Сдвиг жёлтого фильтра увеличителя для цветового баланса отпечатка. | print → тот же раздел + прямой поиск | params.printYFilterShift; (v) => setParam("printYFilterShift", v) | -40 / 40 / 1 | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| M, CC | Сдвиг пурпурного фильтра увеличителя для цветового баланса отпечатка. | print → тот же раздел + прямой поиск | params.printMFilterShift; (v) => setParam("printMFilterShift", v) | -40 / 40 / 1 | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Предвспышка | Слабая дополнительная засветка бумаги до основной печати. Помогает менять поведение светов. | print → тот же раздел + прямой поиск | params.preflashExposure; (v) => setParam("preflashExposure", v) | 0.01 / 0.2 / 0.005 | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Предвспышка Y | Жёлтый фильтр только для дополнительной засветки бумаги. | print → тот же раздел + прямой поиск | params.preflashYShift; (v) => setParam("preflashYShift", v) | -20 / 20 / 1 | advanced → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Предвспышка M | Пурпурный фильтр только для дополнительной засветки бумаги. | print → тот же раздел + прямой поиск | params.preflashMShift; (v) => setParam("preflashMShift", v) | -20 / 20 / 1 | advanced → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Химия бумаги | Включает послойную модель проявки бумаги с истощением и отдельными коэффициентами. | print → тот же раздел + прямой поиск | params.chemistryActive; (v) => setParam("chemistryActive", v) |  /  /  | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Истощение | Изменение формы кривой бумаги при истощении проявителя. | print → тот же раздел + прямой поиск | params.developerExhaustion; (v) => setParam("developerExhaustion", v) | 0 / 1 / 0.02 | params.chemistryActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| γ быстрая | Коэффициент быстрых слоёв бумаги; используется при включённой химии бумаги. | print → тот же раздел + прямой поиск | params.printGammaFast; (v) => setParam("printGammaFast", v) | 0.4 / 2 / 0.05 | advanced && params.chemistryActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| γ медленная | Коэффициент средних и медленных слоёв бумаги; используется при включённой химии бумаги. | print → тот же раздел + прямой поиск | params.printGammaSlow; (v) => setParam("printGammaSlow", v) | 0.4 / 2 / 0.05 | advanced && params.chemistryActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| γ R | Коэффициент проявки цветного канала бумаги. Меняет её кривую при включённой химии. | print → тот же раздел + прямой поиск | params.printGammaR; (v) => setParam("printGammaR", v) | 0.4 / 2 / 0.05 | advanced && params.chemistryActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| γ G | Коэффициент проявки цветного канала бумаги. Меняет её кривую при включённой химии. | print → тот же раздел + прямой поиск | params.printGammaG; (v) => setParam("printGammaG", v) | 0.4 / 2 / 0.05 | advanced && params.chemistryActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| γ B | Коэффициент проявки цветного канала бумаги. Меняет её кривую при включённой химии. | print → тот же раздел + прямой поиск | params.printGammaB; (v) => setParam("printGammaB", v) | 0.4 / 2 / 0.05 | advanced && params.chemistryActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Диффузия печати | Оптический рассеивающий фильтр: мягкость и свечение до следующего этапа обработки. | print → тот же раздел + прямой поиск | params.printDiffusion.active; (v) => patch({ printDiffusion: { ...params.printDiffusion, active: v } }) |  /  /  | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Фильтр | Оптический рассеивающий фильтр, имитирующий мягкость и свечение объектива. | print → тот же раздел + прямой поиск | ;  |  /  /  | params.printDiffusion.active && !params.scanFilm && !isPaperBypass(params.printPaper) → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Сила | Сила ореолов вокруг ярких объектов. Ноль убирает их вклад. | print → тот же раздел + прямой поиск | params.printDiffusion.strength; (v) => patch({ printDiffusion: { ...params.printDiffusion, strength: v } }) | 0 / 2 / 0.125 | params.printDiffusion.active && !params.scanFilm && !isPaperBypass(params.printPaper) → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Масштаб PSF | Радиус оптического рассеяния фильтра. | print → тот же раздел + прямой поиск | params.printDiffusion.spatialScale; (v) => patch({ printDiffusion: { ...params.printDiffusion, spatialScale: v } }) | 0 / 4 / 0.1 | advanced → params.printDiffusion.active && !params.scanFilm && !isPaperBypass(params.printPaper) → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Блик | Световая вуаль при сканировании готового отпечатка. | print → тот же раздел + прямой поиск | params.glareActive; (v) => setParam("glareActive", v) |  /  /  | !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Блик, % | Доля световой вуали. Повышение делает тёмные участки менее глубокими. | print → тот же раздел + прямой поиск | params.glarePercent; (v) => setParam("glarePercent", v) | 0 / 0.25 / 0.01 | params.glareActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Шероховатость | Неоднородность световой вуали на поверхности отпечатка. | print → тот же раздел + прямой поиск | params.glareRoughness; (v) => setParam("glareRoughness", v) | 0 / 1 / 0.05 | advanced && params.glareActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Размытие блика | Насколько плавно распределяется световая вуаль. | print → тот же раздел + прямой поиск | params.glareBlur; (v) => setParam("glareBlur", v) | 0 / 2 / 0.05 | advanced && params.glareActive → !isPaperBypass(params.printPaper) → params.output.mode!=='paper' → tool === "print" | по задаче |
| Скан как плёнка | Выбирает прямой скан проявленной виртуальной плёнки вместо печати на фотобумаге. Это не конвертация настоящего негатива. | scan → тот же раздел + прямой поиск | params.scanFilm; (v) => setParam("scanFilm", v) |  /  /  | params.output.mode==='paper' → tool === "scan" | по задаче |
| Unsharp σ | Радиус повышения резкости готового скана. Не меняет размер зерна эмульсии. | scan → тот же раздел + прямой поиск | params.scanUnsharpSigma; (v) => setParam("scanUnsharpSigma", v) | 0 / 2 / 0.05 | tool === "scan" | по задаче |
| Unsharp сила | Усиление мелких контрастных границ на готовом скане. | scan → тот же раздел + прямой поиск | params.scanUnsharpAmount; (v) => setParam("scanUnsharpAmount", v) | 0 / 2 / 0.05 | tool === "scan" | по задаче |
| Размытие сканера | Смягчение готового скана, как при ограниченной резкости сканирующей оптики. | scan → тот же раздел + прямой поиск | params.scanLensBlur; (v) => setParam("scanLensBlur", v) | 0 / 8 / 0.1 | tool === "scan" | по задаче |
| Коррекция белого | Приводит светлую опорную точку скана к выбранному уровню. | scan → тот же раздел + прямой поиск | params.scanWhiteCorrection; (v) => setParam("scanWhiteCorrection", v) |  /  /  | params.output.mode==='paper'//params.output.mode==='negative' → tool === "scan" | по задаче |
| Коррекция чёрного | Приводит тёмную опорную точку скана к выбранному уровню. | scan → тот же раздел + прямой поиск | params.scanBlackCorrection; (v) => setParam("scanBlackCorrection", v) |  /  /  | params.output.mode==='paper'//params.output.mode==='negative' → tool === "scan" | по задаче |
| Белая точка | Целевой уровень белого для включённой коррекции. Меньше — темнее самые светлые участки. | scan → тот же раздел + прямой поиск | params.scanWhiteLevel; (v) => setParam("scanWhiteLevel", v) | 0.7 / 1 / 0.01 | advanced → params.output.mode==='paper'//params.output.mode==='negative' → tool === "scan" | по задаче |
| Чёрная точка | Целевой уровень чёрного для включённой коррекции. Больше — светлее самые глубокие тени. | scan → тот же раздел + прямой поиск | params.scanBlackLevel; (v) => setParam("scanBlackLevel", v) | 0 / 0.2 / 0.005 | advanced → params.output.mode==='paper'//params.output.mode==='negative' → tool === "scan" | по задаче |
| Поворот | Поворот фотографии на 90 градусов без изменения параметров плёнки. | crop → тот же раздел + прямой поиск | ;  |  /  /  | tool === "crop" | часто |
| Кадр | Пропорции обрезки. Выбор фиксированного отношения включает кадрирование. | crop → тот же раздел + прямой поиск | ;  |  /  /  | tool === "crop" | часто |
| Кроп | Оставляет только выбранную область фотографии. | crop → тот же раздел + прямой поиск | params.crop; (v) => setParam("crop", v) |  /  /  | tool === "crop" | часто |
| Размер | Размер сохраняемой области кадра. Положение задаётся отдельно по X и Y. | crop → тот же раздел + прямой поиск | params.cropSizeX; (v) => patch({ cropSizeX: v, cropSizeY: v }) | 0.08 / 0.8 / 0.01 | params.crop → tool === "crop" | часто |
| X | Горизонтальное положение центра области обрезки. | crop → тот же раздел + прямой поиск | params.cropCenterX; (v) => setParam("cropCenterX", v) | 0.1 / 0.9 / 0.01 | params.crop → tool === "crop" | часто |
| Y | Вертикальное положение центра области обрезки. | crop → тот же раздел + прямой поиск | params.cropCenterY; (v) => setParam("cropCenterY", v) | 0.1 / 0.9 / 0.01 | params.crop → tool === "crop" | часто |
| Холст 18% | Нейтральный серый фон для оценки яркости. Не меняет пиксели фотографии. | crop → тот же раздел + прямой поиск | params.gray18Canvas; (v) => setParam("gray18Canvas", v) |  /  /  | tool === "crop" | часто |
| Рамка фотографии | Плёночные края 135 и 120 с надписями, перфорация и DX у 135, либо минималистичная белая кромка. Включается при экспорте; исходник сохраняется. | crop → тот же раздел + прямой поиск | params.frameStyle; setParam(frameStyle, style.value) |  /  /  | tool === "crop" | часто |
| Номер кадра | Декоративный номер на выбранном плёночном крае. | crop → тот же раздел + прямой поиск | params.frameNumber; v => setParam("frameNumber",v) | 1 / 99 / 1 | isOriginalEdge(params.frameStyle) → tool === "crop" | часто |
| DX-полоса | Декоративная полоса на рамке 135; не меняет обработку фотографии. | crop → тот же раздел + прямой поиск | params.frameBarcode; v => setParam("frameBarcode",v) |  /  /  | params.frameStyle === "135" → isOriginalEdge(params.frameStyle) → tool === "crop" | часто |
| Дата на снимке | Необязательная надпись в плёночной кромке; оставьте пустой, чтобы не печатать дату. | crop → тот же раздел + прямой поиск | params.frameDate; e=>setParam("frameDate",e.target.value) |  /  /  | isOriginalEdge(params.frameStyle) → tool === "crop" | часто |
| RGB → спектр | Метод восстановления спектрального отклика для прежних профилей. Новые методы находятся в меню «Спектр». | lab → тот же раздел + прямой поиск | ;  |  /  /  | tool === "lab" | по задаче |
| Hanatos окно | Спектральное окно адаптации Hanatos. Для других методов может не применяться. | lab → тот же раздел + прямой поиск | params.hanatosWindow; (v) => setParam("hanatosWindow", v) |  /  /  | tool === "lab" | по задаче |
| Hanatos поверхность | Дополнительная коррекция спектрального отклика Hanatos, когда она есть в профиле. | lab → тот же раздел + прямой поиск | params.hanatosSurface; (v) => setParam("hanatosSurface", v) |  /  /  | tool === "lab" | по задаче |
| Спектр. размытие | Сглаживает спектральную чувствительность до расчёта экспозиции, не размывая саму фотографию. | lab → тот же раздел + прямой поиск | params.spectralBlur; (v) => setParam("spectralBlur", v) | 0 / 4 / 0.1 | tool === "lab" | по задаче |
| Входной гамут | Обработка цветов исходника за границей видимого спектрального охвата. | lab → тот же раздел + прямой поиск | ;  |  /  /  | tool === "lab" | по задаче |
| Выходной гамут | Как уложить насыщенные цвета в пространство файла с меньшими искажениями оттенков. | lab → тот же раздел + прямой поиск | ;  |  /  /  | tool === "lab" | по задаче |
| LUT превью | Разрешение вычислительной таблицы предпросмотра: выше — точнее, но дольше. Это не творческий LUT. | lab → тот же раздел + прямой поиск | params.lutResolution; (v) => setParam("lutResolution", v) | 9 / 33 / 4 | advanced → tool === "lab" | по задаче |
| Апскейл | Увеличение рабочего изображения до обработки. Повышает расход памяти и время расчёта. | lab → тот же раздел + прямой поиск | params.upscaleFactor; (v) => setParam("upscaleFactor", v) | 1 / 4 / 1 | advanced → tool === "lab" | по задаче |
| Декод CCTF | Преобразование кодированных RGB в линейный свет. Для обычного импорта оставьте штатные настройки. | lab → тот же раздел + прямой поиск | params.applyCctfDecoding; (v) => setParam("applyCctfDecoding", v) |  /  /  | advanced → tool === "lab" | по задаче |
| Формат | JPEG — компактный файл для просмотра; PNG — без потерь после обработки. | export → тот же раздел + прямой поиск | ;  |  /  /  | tool === "export" | часто |
| Качество | Степень JPEG-сжатия. Выше — меньше потерь и больше размер файла. | export → тот же раздел + прямой поиск | params.exportQuality; (v) => setParam("exportQuality", v) | 85 / 100 / 1 | params.exportFormat === "jpeg" → tool === "export" | часто |
| Цвет | Цветовое пространство файла. sRGB подходит большинству экранов и сайтов. | export → тот же раздел + прямой поиск | ;  |  /  /  | tool === "export" | часто |
| Выходной CCTF | Кодирует яркость для просмотра на экране. Отключайте только для осознанной работы с линейными данными. | export → тот же раздел + прямой поиск | params.outputCctf; (v) => setParam("outputCctf", v) |  /  /  | tool === "export" | часто |
| Сжатие гамута | Ограничивает цвета для выбранного выходного пространства. | export → тот же раздел + прямой поиск | params.gamutCompress; (v) => setParam("gamutCompress", v) |  /  /  | tool === "export" | часто |
| Виртуальный увеличитель | Разрешает отдельное экспериментальное рабочее пространство увеличителя. Открывается кнопкой в этой карточке; обычная печать доступна во вкладке «Печать». | settings → тот же раздел + прямой поиск | prefs.experimentalEnlarger; value=>setPref("experimentalEnlarger",value) |  /  /  | Без условного родителя | по задаче |
| Пояснения к параметрам | Показывает описания постоянно. При отключении пояснения всё равно можно раскрыть непосредственно у параметра. | settings → тот же раздел + прямой поиск | prefs.showControlHelp; v=>setPref("showControlHelp",v) |  /  /  | Без условного родителя | по задаче |
| Подписи вкладок | Показывает текст у значков инструментов. Поиск параметров остаётся доступным в рейке. | settings → тот же раздел + прямой поиск | prefs.showToolLabels; (v) => setPref("showToolLabels", v) |  /  /  | Без условного родителя | по задаче |
| Лаб и журнал в рейке | Закрепляет вычислительные настройки и журнал в навигации. Эти разделы также доступны через поиск. | settings → тот же раздел + прямой поиск | prefs.showLabTabs; (v) => setPref("showLabTabs", v) |  /  /  | Без условного родителя | по задаче |
| Касание прячет панели | Касание фотографии скрывает панели для просмотра кадра. Повторное касание возвращает управление. | settings → тот же раздел + прямой поиск | prefs.tapHidesChrome; (v) => setPref("tapHidesChrome", v) |  /  /  | Без условного родителя | по задаче |
| Сброс на новый файл | При открытии другой фотографии сбрасывает настройки обработки. Отключите, чтобы применять текущие настройки к следующим кадрам. | settings → тот же раздел + прямой поиск | prefs.resetOnOpen; (v) => setPref("resetOnOpen", v) |  /  /  | Без условного родителя | по задаче |
| Спросить перед сохранением | Запрашивает подтверждение перед расчётом и сохранением файла. Не влияет на обработку пикселей. | settings → тот же раздел + прямой поиск | prefs.confirmExport; (v) => setPref("confirmExport", v) |  /  /  | Без условного родителя | по задаче |
| GPU превью | Ускорение видеочипом с проверкой доступности и возвратом к CPU, если путь недоступен. | settings → тот же раздел + прямой поиск | params.gpuPreview; (v) => setParam("gpuPreview", v) |  /  /  | Без условного родителя | по задаче |
| GPU экспорт | Разрешает проверенные ускоренные вычисления при сохранении. Доступность зависит от телефона. | settings → тот же раздел + прямой поиск | params.gpuExport; (v) => setParam("gpuExport", v) |  /  /  | Без условного родителя | по задаче |
| Экспозиция подготовки | Общий сдвиг яркости до плёнки. Печать не отменяет этот сдвиг автоматически. | prep → тот же раздел + прямой поиск | prep.exposure; row("exposure", "Экспозиция подготовки", -3, 3, 0.05) | -3 / 3 / 0.05 | Без условного родителя | часто |
| Света | Снижайте, чтобы приглушить яркие участки; повышайте, чтобы сделать их заметнее. | prep → тот же раздел + прямой поиск | prep.highlights; row("highlights", "Света", -180, 100) | -180 / 100 / 1 | Без условного родителя | часто |
| Тени | Поднимает или затемняет тёмные участки, сохраняя границы объектов. | prep → тот же раздел + прямой поиск | prep.shadows; row("shadows", "Тени") | -100 / 100 / 1 | Без условного родителя | часто |
| Контраст подготовки | Меняет разницу между светлыми и тёмными тонами исходника до плёнки. | prep → тот же раздел + прямой поиск | prep.contrast; row("contrast", "Контраст подготовки") | -100 / 100 / 1 | Без условного родителя | часто |
| Подъём чёрного · Lift | Сдвигает нижнюю часть тонального диапазона: отрицательное значение углубляет чёрный. | prep → тот же раздел + прямой поиск | prep.lift; row("lift", "Подъём чёрного · Lift") | -100 / 100 / 1 | Без условного родителя | часто |
| Усиление · Gain | Меняет верхний уровень тонального диапазона. Это не отдельная экспозиция в EV. | prep → тот же раздел + прямой поиск | prep.gain; row("gain", "Усиление · Gain") | -100 / 100 / 1 | Без условного родителя | часто |
| Color Boost | Сильнее влияет на слабонасыщенные цвета; полезен для блеклого исходника. | prep → тот же раздел + прямой поиск | prep.colorBoost; row("colorBoost", "Color Boost") | -100 / 100 / 1 | Без условного родителя | часто |
| Насыщенность подготовки | Общая интенсивность цвета перед плёнкой. −100 убирает цвет. | prep → тот же раздел + прямой поиск | prep.saturation; row("saturation", "Насыщенность подготовки") | -100 / 100 / 1 | Без условного родителя | часто |
| Детали средних тонов | Усиливает или смягчает локальный контраст фактур без обычной резкости по краям. | prep → тот же раздел + прямой поиск | prep.detail; row("detail", "Детали средних тонов") | -100 / 100 / 1 | Без условного родителя | часто |
| Формат кадра · Negs | Физический размер кадра меняет относительный размер зерна и ореолов. | negs → тот же раздел + прямой поиск | ;  |  /  /  | Без условного родителя | по задаче |
| Зерно | Включает случайную структуру эмульсии, зависящую от плотности изображения. | negs → тот же раздел + прямой поиск | p.grainActive; (v) => setParam("grainActive", v) |  /  /  | Без условного родителя | по задаче |
| DIR-каплеры | Взаимодействие проявляющихся слоёв. Меняет локальный контраст, края и цветовые переходы. | negs → тот же раздел + прямой поиск | p.couplersActive; (v) => setParam("couplersActive", v) |  /  /  | Без условного родителя | по задаче |
| Зерно | Включает случайную структуру эмульсии, зависящую от плотности изображения. | texture → тот же раздел + прямой поиск | params.grainActive; v=>setParam('grainActive',v) |  /  /  | Без условного родителя | по задаче |
| Размытие зерна | Сглаживает структуру зерна после её формирования. Большие значения дают более мягкую фактуру. | texture → тот же раздел + прямой поиск | params.grainBlur; v=>setParam('grainBlur',v) | 0 / 1.4 / .05 | params.grainActive | по задаче |
| Частица, µm² | Площадь частиц в прежней модели: больше — крупнее и заметнее зерно. Только при выключенном RMS. | texture → тот же раздел + прямой поиск | params.grainParticleArea; v=>setParam('grainParticleArea',v) | .04 / 1.2 / .02 | !params.experimental.grainRms → params.grainActive | по задаче |
| Подслои | Разделяет образование зерна по подслоям эмульсии, если профиль содержит их данные. | texture → тот же раздел + прямой поиск | params.grainSublayers; v=>setParam('grainSublayers',v) |  /  /  | !params.experimental.grainRms → params.grainActive | по задаче |
| Равномерность | Регулирует статистику распределения частиц. В режиме RMS задаётся отдельно для каналов. | texture → тот же раздел + прямой поиск | params.grainUniformity; v=>setParam('grainUniformity',v) | .85 / .995 / .005 | !params.experimental.grainRms → params.grainActive | по задаче |
| Dmin зерна | Нижний уровень плотности, участвующий в образовании зерна, в том числе в светлых участках. | texture → тот же раздел + прямой поиск | params.grainDensityMin; v=>setParam('grainDensityMin',v) | 0 / .3 / .01 | !params.experimental.grainRms → params.grainActive | по задаче |
| Облака, µm | Размер облаков красителя вокруг частиц. Влияет на мягкость структуры, а не на фокус объектива. | texture → тот же раздел + прямой поиск | params.grainDyeCloudsUm; v=>setParam('grainDyeCloudsUm',v) | 0 / 4 / .1 | params.grainActive | по задаче |
| DIR-каплеры | Взаимодействие проявляющихся слоёв. Меняет локальный контраст, края и цветовые переходы. | texture → тот же раздел + прямой поиск | params.couplersActive; (v) => setParam("couplersActive", v) |  /  /  | Без условного родителя | по задаче |
| Количество | Общая сила взаимодействия слоёв. Ноль отключает вклад каплеров. | texture → тот же раздел + прямой поиск | params.couplersAmount; (v) => setParam("couplersAmount", v) | 0 / 2.5 / 0.05 | params.couplersActive | по задаче |
| Межслойное | Насколько проявка одного цветного слоя влияет на соседние слои. | texture → тот же раздел + прямой поиск | params.inhibitionInterlayer; (v) => setParam("inhibitionInterlayer", v) | 0 / 2 / 0.05 | params.couplersActive | по задаче |
| Свой слой | Насколько проявляющийся слой сдерживает собственное дальнейшее развитие. | texture → тот же раздел + прямой поиск | params.inhibitionSamelayer; (v) => setParam("inhibitionSamelayer", v) | 0 / 2 / 0.05 | params.couplersActive | по задаче |
| Диффузия, µm | Дальность распространения ингибиторов. Влияет на ширину краевых эффектов. | texture → тот же раздел + прямой поиск | params.couplerDiffusionUm; (v) => setParam("couplerDiffusionUm", v) | 0 / 80 / 5 | params.couplersActive | по задаче |
| Найти инструмент | Контекст и описание — tools-menu.tsx | settings → тот же раздел + прямой поиск | query; (e) => setQuery(e.target.value) |  /  /  | Без условного родителя | по задаче |

## Полный контракт сохранения

Корневые поля defaultParams (включая не являющиеся отдельным ползунком):

- `experimental`
- `prep`
- `transport`
- `output`
- `filmStock`
- `printPaper`
- `exposureCompensationEv`
- `autoExposure`
- `autoExposureMethod`
- `filmFormatMm`
- `cameraLensBlurUm`
- `cameraDiffusion`
- `printIlluminant`
- `printExposure`
- `printExposureCompensation`
- `printYFilterShift`
- `printMFilterShift`
- `printCFilterNeutral`
- `printYFilterNeutral`
- `printMFilterNeutral`
- `printDiffusion`
- `scanLensBlur`
- `scanWhiteCorrection`
- `scanWhiteLevel`
- `scanBlackCorrection`
- `scanBlackLevel`
- `scanUnsharpSigma`
- `scanUnsharpAmount`
- `scanFilm`
- `outputCctf`
- `autoPreview`
- `previewMaxSize`
- `gray18Canvas`
- `whitePadding`
- `frameStyle`
- `frameNumber`
- `frameBarcode`
- `frameDate`
- `crop`
- `cropCenterX`
- `cropCenterY`
- `cropSizeX`
- `cropSizeY`
- `applyCctfDecoding`
- `upscaleFactor`
- `filterUvAmount`
- `filterIrAmount`
- `whiteBalance`
- `temperature`
- `tint`
- `grainActive`
- `grainParticleArea`
- `grainScaleR`
- `grainScaleG`
- `grainScaleB`
- `grainDensityMin`
- `grainUniformity`
- `grainBlur`
- `grainDyeCloudsUm`
- `halationActive`
- `scatterAmount`
- `scatterSpatialScale`
- `halationAmount`
- `halationSpatialScale`
- `boostEv`
- `protectEv`
- `boostRange`
- `scatterCoreUm`
- `scatterTailUm`
- `scatterTailWeight`
- `halationStrength`
- `halationFirstSigmaUm`
- `halationNBounces`
- `halationBounceDecay`
- `halationRenormalize`
- `couplersActive`
- `couplersAmount`
- `inhibitionSamelayer`
- `inhibitionInterlayer`
- `gammaSamelayer`
- `gammaRtoGB`
- `gammaGtoRB`
- `gammaBtoRG`
- `couplerDiffusionUm`
- `glareActive`
- `glarePercent`
- `glareRoughness`
- `glareBlur`
- `chemistryActive`
- `printGamma`
- `printGammaFast`
- `printGammaSlow`
- `printGammaR`
- `printGammaG`
- `printGammaB`
- `developerExhaustion`
- `filmGamma`
- `preflashExposure`
- `preflashYShift`
- `preflashMShift`
- `gamutCompress`
- `rgbToRawMethod`
- `hanatosWindow`
- `hanatosSurface`
- `spectralBlur`
- `useEnlargerLut`
- `useScannerLut`
- `lutResolution`
- `useFastStats`
- `gpuPreview`
- `gpuExport`
- `rawEngine`
- `rawEngineStyle`
- `grainSublayers`
- `grainSubLayersN`
- `inputGamutCompress`
- `outputGamutCompress`
- `exportFormat`
- `exportQuality`
- `exportMaxEdge`
- `exportColorSpace`
- `orientation`
- `cropAspect`
- `toneCurveActive`
- `toneCurveMaster`
- `toneCurveRed`
- `toneCurveGreen`
- `toneCurveBlue`
- `toneBrightness`
- `toneContrast`
- `toneSaturation`
- `toneHighlights`
- `toneShadows`
- `toneWarmth`

## Действия рабочего пространства

| Действие | Назначение и доступ | Связи / точность | Частота — гипотеза |
|---|---|---|---|
| Импорт / примеры | Открыть на верхней панели, галерея, drag-and-drop в браузере | Декодирование RAW / обычного файла; параметры сбрасываются только по установленной настройке | часто |
| Выбор материала | Плёнки и Бумага: коллекции, поиск, избранное | Профильные параметры, ISO, времена проявки; числа не объединяются | часто |
| Рецепты | Пресеты: применить / сохранить / импортировать / удалить свой | Сериализация полных параметров; сохранённые рецепты не удаляются обновлением | часто |
| Сравнение | Панель кадра: исходник, раздельный просмотр, A/B | Один текущий кадр и текущее состояние; без воздействия на экспорт | часто |
| Масштаб / перемещение | Жесты на изображении и элементы просмотра | Просмотр деталей; не меняет разрешение файла | часто |
| Undo / Redo / сброс | Явные кнопки и клавиатура; числовой сброс у значения | Изменение параметра создаёт запись Undo; ввод можно отменить до применения | часто |
| Взять параметры профиля | Контекстные кнопки RMS / DIR / времени проявки | Зависят от выбранного профиля; не заменяют ручные ползунки | по задаче |
| Калибровка негатива | Сканы негативов: маска и матрица устройства | Нужен нативный движок и скан; защищено от изменения кадра во время расчёта | по задаче |
| Пакетная обработка | Очередь: добавить / обработать / убрать | Использует параметры серии и нативный экспорт | по задаче |
| Экспорт | Верхняя кнопка и раздел Файл | JPEG / PNG, размер, качество, цветовое пространство, рамка | часто |
| Виртуальный увеличитель | Настройки: разрешить эксперимент и открыть рабочее пространство | Существующая самостоятельная экспериментальная поверхность, не переработана этим изменением | по задаче |

Матрица контролов не является трассировкой каждой C++ ветви. Доказательство сохранения UI-контракта: check-ux-ranges.mjs; алгоритмические suite и границы проверки описаны в REVIEW.md.
