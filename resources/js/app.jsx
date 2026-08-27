import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

// The stylesheet is a separate Vite entry (see vite.config.js) so Blade can
// emit a real <link> tag instead of waiting on the JS bundle.

import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { MemberAuthProvider, useMemberAuth } from '@/auth/MemberAuthProvider'
import { AppLayout } from '@/components/AppLayout'
import { MemberLayout } from '@/components/MemberLayout'
import { Spinner } from '@/components/common'
import { ApiError } from '@/lib/api'

import Login from '@/pages/Login'
import PublicBadge from '@/pages/PublicBadge'
import Dashboard from '@/pages/Dashboard'
import Unauthorized from '@/pages/Unauthorized'
import NotFound from '@/pages/NotFound'
import MembersList from '@/pages/members/MembersList'
import MemberForm from '@/pages/members/MemberForm'
import MemberView from '@/pages/members/MemberView'
import BadgeSheet from '@/pages/members/BadgeSheet'
import AnnouncementsList from '@/pages/announcements/AnnouncementsList'
import AnnouncementForm from '@/pages/announcements/AnnouncementForm'
import AnnouncementView from '@/pages/announcements/AnnouncementView'
import MeetingsList from '@/pages/meetings/MeetingsList'
import MeetingForm from '@/pages/meetings/MeetingForm'
import Attendance from '@/pages/meetings/Attendance'
import Participants from '@/pages/meetings/Participants'
import UsersList from '@/pages/users/UsersList'
import UserForm from '@/pages/users/UserForm'
import CheckIn from '@/pages/member/CheckIn'
import MyDetails from '@/pages/member/MyDetails'
import MyMeetings from '@/pages/member/MyMeetings'
import News from '@/pages/member/News'
import MemberAnnouncements from '@/pages/member/Announcements'
import MemberForumTopics from '@/pages/member/forum/ForumTopics'
import MemberForumTopicView from '@/pages/member/forum/ForumTopicView'
import ForumTopicsList from '@/pages/forum/ForumTopicsList'
import ForumTopicView from '@/pages/forum/ForumTopicView'
import IncidentsList from '@/pages/incidents/IncidentsList'
import MemberIncidents from '@/pages/member/Incidents'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying an auth or permission failure just burns requests.
        if (error instanceof ApiError && [401, 403, 404, 422].includes(error.status)) return false
        return failureCount < 2
      },
    },
  },
})

function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <Spinner className="size-6 text-primary" />
    </div>
  )
}

/** Blocks a route until the stored token has been verified against the API. */
function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageSpinner />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return children
}

/**
 * Every management screen was gated behind hasRole('admin') server side; the
 * client mirrors that so the user gets a clear page instead of a failed request.
 */
function RequireAdmin({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Unauthorized />
  return children
}

/**
 * Guards the member portal. Sends an unauthenticated visitor to /check-in rather
 * than /login: that is the members' sign-in, and /login is the staff one.
 */
function RequireMember({ children }) {
  const { isAuthenticated, isLoading } = useMemberAuth()

  if (isLoading) return <FullPageSpinner />
  if (!isAuthenticated) return <Navigate to="/check-in" replace />

  return children
}

/** Keeps the old /attendance/{meeting} links working. */
function LegacyAttendanceRedirect() {
  const { id } = useParams()
  return <Navigate to={`/meetings/${id}/attendance`} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public: a member proves who they are and collects their own badge. */}
      <Route path="/badge" element={<PublicBadge />} />

      {/*
        Public because a member arriving at a meeting has no session yet. The
        page itself signs them in before it will scan anything.
      */}
      <Route path="/check-in" element={<CheckIn />} />

      {/*
        The member portal. Separate from the staff tree below: members hold no
        role, and the only records they may reach are their own.
      */}
      <Route
        path="/my"
        element={
          <RequireMember>
            <MemberLayout />
          </RequireMember>
        }
      >
        <Route index element={<MyDetails />} />
        <Route path="meetings" element={<MyMeetings />} />
        <Route path="announcements" element={<MemberAnnouncements />} />
        <Route path="forum" element={<MemberForumTopics />} />
        <Route path="forum/:id" element={<MemberForumTopicView />} />
        <Route path="incidents" element={<MemberIncidents />} />
        <Route path="news" element={<News />} />
      </Route>

      {/* Print view: deliberately outside AppLayout so no app chrome is printed. */}
      <Route
        path="/members/badges"
        element={
          <RequireAuth>
            <RequireAdmin>
              <BadgeSheet />
            </RequireAdmin>
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="meetings">
          <Route index element={<RequireAdmin><MeetingsList /></RequireAdmin>} />
          <Route path="create" element={<RequireAdmin><MeetingForm /></RequireAdmin>} />
          <Route path=":id/edit" element={<RequireAdmin><MeetingForm /></RequireAdmin>} />
          <Route path=":id/attendance" element={<RequireAdmin><Attendance /></RequireAdmin>} />
          <Route path=":id/participants" element={<RequireAdmin><Participants /></RequireAdmin>} />
        </Route>

        <Route path="members">
          <Route index element={<RequireAdmin><MembersList /></RequireAdmin>} />
          <Route path="create" element={<RequireAdmin><MemberForm /></RequireAdmin>} />
          <Route path=":id" element={<RequireAdmin><MemberView /></RequireAdmin>} />
          <Route path=":id/edit" element={<RequireAdmin><MemberForm /></RequireAdmin>} />
        </Route>

        <Route path="announcements">
          <Route index element={<RequireAdmin><AnnouncementsList /></RequireAdmin>} />
          <Route path="create" element={<RequireAdmin><AnnouncementForm /></RequireAdmin>} />
          <Route path=":id" element={<RequireAdmin><AnnouncementView /></RequireAdmin>} />
          <Route path=":id/edit" element={<RequireAdmin><AnnouncementForm /></RequireAdmin>} />
        </Route>

        <Route path="forum">
          <Route index element={<RequireAdmin><ForumTopicsList /></RequireAdmin>} />
          <Route path=":id" element={<RequireAdmin><ForumTopicView /></RequireAdmin>} />
        </Route>

        <Route path="users">
          <Route index element={<RequireAdmin><UsersList /></RequireAdmin>} />
          <Route path="create" element={<RequireAdmin><UserForm /></RequireAdmin>} />
          <Route path=":id/edit" element={<RequireAdmin><UserForm /></RequireAdmin>} />
        </Route>

        <Route path="incidents" element={<RequireAdmin><IncidentsList /></RequireAdmin>} />

        <Route path="attendance/:id" element={<LegacyAttendanceRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <MemberAuthProvider>
            <App />
            <Toaster position="top-center" richColors closeButton />
          </MemberAuthProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
