package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import com.example.data.AppDatabase
import com.example.data.CanchaReservaRepository
import com.example.ui.CanchaReservaAppContent
import com.example.ui.CanchaReservaViewModel
import com.example.ui.CanchaReservaViewModelFactory
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize Room Database carefully
        val database = AppDatabase.getDatabase(applicationContext)
        val repository = CanchaReservaRepository(
            sportComplexDao = database.sportComplexDao(),
            matchSessionDao = database.matchSessionDao(),
            bookingDao = database.bookingDao(),
            userProfileDao = database.userProfileDao()
        )

        // Instantiate ViewModel using custom Factory
        val viewModel: CanchaReservaViewModel by viewModels {
            CanchaReservaViewModelFactory(repository)
        }

        setContent {
            MyApplicationTheme {
                Scaffold(
                    modifier = Modifier.fillMaxSize()
                ) { innerPadding ->
                    // Main Container with innerPadding applied inside CanchaReservaAppContent
                    CanchaReservaAppContent(viewModel = viewModel)
                }
            }
        }
    }
}
