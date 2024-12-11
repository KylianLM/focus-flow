// app.js
const { createApp, ref, computed, onMounted } = Vue

// Valeurs par défaut pour les paramètres
const DEFAULT_SETTINGS = {
    focusDuration: 25,          // 25 minutes de travail (standard Pomodoro)
    shortBreakDuration: 5,      // 5 minutes de petite pause
    longBreakDuration: 15,      // 15 minutes de grande pause
    cyclesBeforeLongBreak: 4,   // Grande pause tous les 4 cycles
    notifications: true         // Notifications activées par défaut
}

// Valeurs par défaut pour les statistiques
const DEFAULT_STATS = {
    totalFocusTime: 0,          // Temps total en secondes
    todaySessions: 0,           // Sessions du jour
    lastSessionDate: null,      // Date de la dernière session
    completedCycles: 0          // Cycles complets terminés
}

createApp({
    setup() {
        // États réactifs
        const timeLeft = ref(DEFAULT_SETTINGS.focusDuration * 60)
        const isActive = ref(false)
        const currentPhase = ref('focus') // 'focus', 'shortBreak', 'longBreak'
        const cycles = ref(0)
        const isDarkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
        const showSettings = ref(false)
        const showBreakPrompt = ref(false)
        const settings = ref({...DEFAULT_SETTINGS})
        const stats = ref({...DEFAULT_STATS})
        
        let interval = null

        // Initialisation
        onMounted(() => {
            const savedStats = localStorage.getItem('focusFlowStats')
            const savedSettings = localStorage.getItem('focusFlowSettings')
            
            // Restauration des statistiques
            if (savedStats) {
                stats.value = {
                    ...DEFAULT_STATS,
                    ...JSON.parse(savedStats)
                }
                
                // Réinitialisation journalière
                const today = new Date().toLocaleDateString()
                if (stats.value.lastSessionDate !== today) {
                    stats.value.todaySessions = 0
                    stats.value.lastSessionDate = today
                }
            }
            
            // Restauration des paramètres
            if (savedSettings) {
                settings.value = {
                    ...DEFAULT_SETTINGS,
                    ...JSON.parse(savedSettings)
                }
            }

            // Met à jour le timer avec la durée de focus par défaut
            timeLeft.value = settings.value.focusDuration * 60

            // Applique le thème sombre si nécessaire
            if (isDarkMode.value) {
                document.documentElement.classList.add('dark')
            }

            // Configuration initiale
            requestNotificationPermission()
            document.addEventListener('keydown', handleKeyPress)
        })

        // Gestion des notifications
        const requestNotificationPermission = async () => {
            if (!('Notification' in window)) {
                console.log('Ce navigateur ne supporte pas les notifications bureau')
                return
            }

            if (Notification.permission === 'default') {
                try {
                    await Notification.requestPermission()
                } catch (error) {
                    console.error('Erreur lors de la demande de permission:', error)
                }
            }
        }

        const sendNotification = (title, message) => {
            if (!settings.value.notifications || !('Notification' in window)) {
                return
            }

            if (Notification.permission === 'granted') {
                try {
                    const notification = new Notification(title, {
                        body: message,
                        requireInteraction: true
                    })

                    notification.onclick = () => {
                        window.focus()
                        notification.close()
                    }
                } catch (error) {
                    console.error('Erreur lors de l\'envoi de la notification:', error)
                }
            }
        }

        // Gestion des raccourcis clavier
        const handleKeyPress = (e) => {
            if (e.target.tagName !== 'INPUT') {
                if (e.code === 'Space') {
                    e.preventDefault()
                    isActive.value ? pauseTimer() : startTimer()
                } else if (e.code === 'KeyR') {
                    e.preventDefault()
                    resetTimer()
                } else if (e.code === 'KeyS') {
                    e.preventDefault()
                    showSettings.value = !showSettings.value
                }
            }
        }

        // Formatage du temps
        const formatTime = computed(() => {
            const minutes = Math.floor(timeLeft.value / 60)
            const seconds = timeLeft.value % 60
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        })

        // Informations sur la phase actuelle
        const phaseInfo = computed(() => {
            switch(currentPhase.value) {
                case 'focus':
                    return {
                        name: 'Focus',
                        icon: '🎯',
                        color: 'text-primary-500 dark:text-primary-400'
                    }
                case 'shortBreak':
                    return {
                        name: 'Petite pause',
                        icon: '☕️',
                        color: 'text-green-500 dark:text-green-400'
                    }
                case 'longBreak':
                    return {
                        name: 'Grande pause',
                        icon: '🌟',
                        color: 'text-purple-500 dark:text-purple-400'
                    }
            }
        })

        // Gestion du timer
        const startTimer = () => {
            if (!isActive.value) {
                isActive.value = true
                interval = setInterval(() => {
                    timeLeft.value--
                    if (currentPhase.value === 'focus') {
                        stats.value.totalFocusTime++
                    }
                    
                    if (timeLeft.value === 0) {
                        clearInterval(interval)
                        isActive.value = false
                        
                        if (currentPhase.value === 'focus') {
                            cycles.value++
                            stats.value.todaySessions++
                            showBreakPrompt.value = true
                            
                            const needLongBreak = cycles.value % settings.value.cyclesBeforeLongBreak === 0
                            sendNotification(
                                'Session terminée !',
                                needLongBreak 
                                    ? `Bravo ! Vous avez complété ${settings.value.cyclesBeforeLongBreak} cycles. Prenez une pause de ${settings.value.longBreakDuration} minutes.`
                                    : `Bien joué ! Prenez une pause de ${settings.value.shortBreakDuration} minutes.`
                            )
                            
                            stats.value.lastSessionDate = new Date().toLocaleDateString()
                            localStorage.setItem('focusFlowStats', JSON.stringify(stats.value))
                        } else {
                            showBreakPrompt.value = true
                            sendNotification(
                                'Pause terminée',
                                'Prêt à reprendre une nouvelle session ?'
                            )
                        }
                    }
                }, 1000)
            }
        }

        const startBreak = () => {
            const needLongBreak = cycles.value % settings.value.cyclesBeforeLongBreak === 0
            currentPhase.value = needLongBreak ? 'longBreak' : 'shortBreak'
            timeLeft.value = (needLongBreak ? settings.value.longBreakDuration : settings.value.shortBreakDuration) * 60
            showBreakPrompt.value = false
            startTimer()
        }

        const startFocus = () => {
            currentPhase.value = 'focus'
            timeLeft.value = settings.value.focusDuration * 60
            showBreakPrompt.value = false
            startTimer()
        }

        const pauseTimer = () => {
            clearInterval(interval)
            isActive.value = false
        }

        const resetTimer = () => {
            clearInterval(interval)
            isActive.value = false
            showBreakPrompt.value = false
            currentPhase.value = 'focus'
            timeLeft.value = settings.value.focusDuration * 60
        }

        // Gestion des paramètres
        const saveSettings = () => {
            localStorage.setItem('focusFlowSettings', JSON.stringify(settings.value))
            if (currentPhase.value === 'focus') {
                timeLeft.value = settings.value.focusDuration * 60
            }
            showSettings.value = false
        }

        // Réinitialisation complète
        const resetAll = () => {
            clearInterval(interval)
            isActive.value = false
            currentPhase.value = 'focus'
            cycles.value = 0
            timeLeft.value = settings.value.focusDuration * 60
            showBreakPrompt.value = false
            stats.value = {...DEFAULT_STATS}
            settings.value = {...DEFAULT_SETTINGS}
            localStorage.removeItem('focusFlowStats')
            localStorage.removeItem('focusFlowSettings')
        }

        // Formatage des durées pour l'affichage
        const formatDuration = (minutes) => {
            const hours = Math.floor(minutes / 60)
            const mins = minutes % 60
            return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
        }

        // Toggle du mode sombre
        const toggleDarkMode = () => {
            isDarkMode.value = !isDarkMode.value
            document.documentElement.classList.toggle('dark')
        }

        return {
            // États
            timeLeft,
            isActive,
            currentPhase,
            cycles,
            isDarkMode,
            showSettings,
            showBreakPrompt,
            settings,
            stats,
            // Computed
            formatTime,
            phaseInfo,
            // Méthodes
            startTimer,
            pauseTimer,
            resetTimer,
            startBreak,
            startFocus,
            saveSettings,
            resetAll,
            formatDuration,
            toggleDarkMode
        }
    }
}).mount('#app')