package com.example.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.data.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

sealed interface Screen {
    object ComplexList : Screen
    data class ComplexDetail(val complex: SportComplex) : Screen
    object MatchList : Screen
    data class MatchDetail(val session: MatchSession) : Screen
    data class CreateMatch(val complex: SportComplex) : Screen
    object BookingHistory : Screen
    object ProfileWallet : Screen
}

class CanchaReservaViewModel(private val repository: CanchaReservaRepository) : ViewModel() {

    val complexes: StateFlow<List<SportComplex>> = repository.complexes
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val matchSessions: StateFlow<List<MatchSession>> = repository.matchSessions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val bookings: StateFlow<List<Booking>> = repository.bookings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val userProfile: StateFlow<UserProfile?> = repository.userProfile
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    private val _currentScreen = MutableStateFlow<Screen>(Screen.ComplexList)
    val currentScreen: StateFlow<Screen> = _currentScreen.asStateFlow()

    private val _uiMessage = MutableStateFlow<String?>(null)
    val uiMessage: StateFlow<String?> = _uiMessage.asStateFlow()

    init {
        viewModelScope.launch {
            repository.initDefaultDataIfEmpty()
        }
    }

    fun navigateTo(screen: Screen) {
        _currentScreen.value = screen
    }

    fun clearMessage() {
        _uiMessage.value = null
    }

    fun bookFullCourt(complex: SportComplex, scheduleTime: String) {
        viewModelScope.launch {
            val success = repository.bookFullCourt(complex, scheduleTime)
            if (success) {
                _uiMessage.value = "¡Cancha Reservada con Éxito para las $scheduleTime:00!"
                navigateTo(Screen.BookingHistory)
            } else {
                _uiMessage.value = "Error: Saldo insuficiente en tu monedero."
            }
        }
    }

    fun createMatchSession(complex: SportComplex, scheduleTime: String, description: String, slotsTotal: Int) {
        viewModelScope.launch {
            val success = repository.createMatchSession(complex, scheduleTime, description, slotsTotal)
            if (success) {
                _uiMessage.value = "¡Partido Exprés de ${complex.sportType} creado con éxito!"
                navigateTo(Screen.MatchList)
            } else {
                _uiMessage.value = "Error: Saldo insuficiente para pagar tu cuota."
            }
        }
    }

    fun joinMatchSession(session: MatchSession) {
        viewModelScope.launch {
            val success = repository.joinMatchSession(session)
            if (success) {
                _uiMessage.value = "¡Te has unido al partido exprés! Tu cuota ha sido debitada."
                navigateTo(Screen.BookingHistory)
            } else {
                _uiMessage.value = "Error: Cupos completos o saldo insuficiente."
            }
        }
    }

    fun addFunds(amount: Double) {
        viewModelScope.launch {
            val success = repository.addFunds(amount)
            if (success) {
                _uiMessage.value = "Se han recargado \$${String.format("%,d", amount.toLong())} CLP a tu monedero."
            }
        }
    }
}

class CanchaReservaViewModelFactory(private val repository: CanchaReservaRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(CanchaReservaViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return CanchaReservaViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
